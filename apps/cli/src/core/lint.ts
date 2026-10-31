import * as path from "path";
import * as fs from "fs/promises";
import { LineCounter, parseDocument, type Document } from "yaml";
import semver from "semver";
import type { ZodError } from "zod";
import { ManifestSchema, locateManifest } from "@henglosio/shared";
import { BoardSchema, ComponentSchema, computeComponentStorageName } from "@henglosio/workflow";

/** One problem `hio lint` found, in one file. */
export type LintIssue = {
	level: "error" | "warning";
	/** Absolute path of the file it's in. */
	file: string;
	/** 1-based line in `file`, when it could be pinned down. */
	line?: number;
	message: string;
};

/** Everything `hio lint` found in one package. */
export type LintReport = {
	/** The package's root folder (where its package.json is). */
	packageDir: string;
	/** Its manifest.yaml, when there is one. */
	manifestPath?: string;
	/** The manifest's `kind`, when it could be read. */
	kind?: string;
	issues: LintIssue[];
};

/** A parsed YAML file, kept with what's needed to point an issue at its line. */
type YamlFile = {
	file: string;
	doc: Document;
	lines: LineCounter;
};

/**
 * Lints a Henglos IO package — what the hosting checks when it installs one,
 * plus what only shows up once it runs:
 *
 * - **package.json** — there, with a `name` and a valid `version`; its `files`
 *   ship the manifest.
 * - **manifest.yaml** — valid YAML, and a valid manifest of its `kind`
 *   (the same schema the hosting uses); `dependences.platform` is a semver range.
 * - **A board** — its `ui.schema` file is there and is a valid board schema.
 * - **A component** — its `schema` is valid; every action's and trigger's
 *   `script` is there, and registers the name the studio sends to the board
 *   (`@action("<component>/<action>")`, all lowercase).
 * - **A platform** — its `build.script` is there.
 *
 * @param target A package folder, or its manifest.yaml.
 * @returns The report. It has no `error` issues when the package is fine to publish.
 */
export async function lintPackage(target: string): Promise<LintReport> {

	const packageDir = await resolvePackageDir(path.resolve(target));
	const report: LintReport = { packageDir, issues: [] };
	const error = (file: string, message: string, line?: number) => report.issues.push({ level: "error", file, message, line });
	const warning = (file: string, message: string, line?: number) => report.issues.push({ level: "warning", file, message, line });

	// ── manifest.yaml ──

	const manifestPath = await locateManifest(packageDir);
	if (!manifestPath) {
		error(packageDir, "No manifest.yaml — it goes at the package's root (or in workspace/, for a board).");
		return report;
	}
	report.manifestPath = manifestPath;
	const manifestDir = path.dirname(manifestPath);

	const yaml = await readYaml(manifestPath, error);
	if (!yaml) return report;

	// Read as it is, not as parsed: the checks below still run on a manifest the
	// schema rejects, so one lint shows every problem, not just the first layer.
	const data = asRecord(yaml.doc.toJS());
	report.kind = typeof data.kind === "string" ? data.kind : undefined;

	const parsed = ManifestSchema.safeParse(data);
	if (!parsed.success) reportZod(parsed.error, yaml, data, [], error);

	const dependences = asRecord(data.dependences);
	if (typeof dependences.platform === "string" && !semver.validRange(dependences.platform)) {
		error(manifestPath, `dependences.platform "${dependences.platform}" isn't a semver range (e.g. ^1.0.0).`, lineOf(yaml, ["dependences", "platform"]));
	}

	// ── What each kind adds ──

	switch (data.kind) {

		case "board": {
			const ui = asRecord(data.ui).schema;
			if (typeof ui !== "string") break;
			const schemaPath = path.resolve(manifestDir, ui);
			if (!(await isFile(schemaPath))) {
				error(manifestPath, `ui.schema: ${ui} doesn't exist.`, lineOf(yaml, ["ui", "schema"]));
				break;
			}
			const schema = await readYaml(schemaPath, error);
			if (!schema) break;
			// The hosting adds the manifest's capabilities to the schema before checking it.
			const schemaData = { ...asRecord(schema.doc.toJS()), ...(data.capabilities !== undefined ? { capabilities: data.capabilities } : {}) };
			const board = BoardSchema.safeParse(schemaData);
			if (!board.success) {
				for (const issue of board.error.issues) {
					// Capabilities are written in the manifest, not in the schema.
					if (issue.path[0] === "capabilities") error(manifestPath, describe(issue, issue.path, schemaData), lineOf(yaml, issue.path));
					else error(schemaPath, describe(issue, issue.path, schemaData), lineOf(schema, issue.path));
				}
			}
			break;
		}

		case "component": {
			const schemaData = { ...asRecord(data.schema), ...(dependences.capabilities !== undefined ? { capabilities: dependences.capabilities } : {}) };
			const component = ComponentSchema.safeParse(schemaData);
			if (!component.success) {
				for (const issue of component.error.issues) {
					// Capabilities are written under dependences, the rest under schema.
					const at = issue.path[0] === "capabilities" ? ["dependences", ...issue.path] : ["schema", ...issue.path];
					error(manifestPath, describe(issue, at, schemaData, issue.path), lineOf(yaml, at));
				}
			}

			// The scripts are checked even when the schema isn't valid: every
			// action and trigger with a displayName and a script.
			const displayName = typeof schemaData.displayName === "string" ? schemaData.displayName : undefined;
			const listed = (list: "actions" | "triggers", decorator: "action" | "trigger") =>
				(Array.isArray(schemaData[list]) ? schemaData[list] as unknown[] : [])
					.map((raw, index) => ({ entry: asRecord(raw), index, list, decorator }))
					.filter(({ entry }) => typeof entry.displayName === "string" && typeof entry.script === "string")
					.map(({ entry, ...rest }) => ({ ...rest, entry: entry as { displayName: string; script: string } }));
			const entries = [...listed("actions", "action"), ...listed("triggers", "trigger")];
			if (component.success && entries.length === 0) warning(manifestPath, "schema: no actions and no triggers — the component adds nothing to the studio.", lineOf(yaml, ["schema"]));
			if (!displayName) break;

			for (const { entry, index, list, decorator } of entries) {
				const at = ["schema", list, index, "script"];
				const scriptPath = path.resolve(manifestDir, entry.script);
				if (!(await isFile(scriptPath))) {
					error(manifestPath, `${formatPath(at)}: ${entry.script} doesn't exist.`, lineOf(yaml, at));
					continue;
				}
				// The studio sends "<component>/<action>", lowercased: the script has
				// to register its class under that same name, or the board can't find it.
				const expected = computeComponentStorageName(displayName, entry.displayName);
				const source = await fs.readFile(scriptPath, "utf-8");
				const declared = [...source.matchAll(/@(action|trigger)\(\s*["']([^"']+)["']\s*\)/g)].map(match => ({
					decorator: match[1],
					name: match[2],
					line: source.slice(0, match.index).split("\n").length,
				}));
				const match = declared.find(d => d.name === expected);
				if (!match) {
					const found = declared.length ? ` It declares ${declared.map(d => `@${d.decorator}("${d.name}")`).join(", ")}.` : "";
					error(scriptPath, `Doesn't declare @${decorator}("${expected}") — the name the studio sends for "${entry.displayName}".${found}`, declared[0]?.line);
				} else if (match.decorator !== decorator) {
					error(scriptPath, `"${expected}" is a${decorator === "action" ? "n action" : " trigger"} in the manifest, but the script declares it with @${match.decorator}.`, match.line);
				}
			}
			break;
		}

		case "platform": {
			const script = asRecord(data.build).script;
			if (typeof script === "string" && !(await isFile(path.resolve(manifestDir, script)))) {
				error(manifestPath, `build.script: ${script} doesn't exist.`, lineOf(yaml, ["build", "script"]));
			}
			break;
		}

	}

	await lintPackageJson(packageDir, manifestPath, error, warning);
	return report;

}

/**
 * Checks the package.json next to the manifest: what npm needs to publish it,
 * and that what it ships includes the manifest.
 */
async function lintPackageJson(
	packageDir: string,
	manifestPath: string,
	error: (file: string, message: string, line?: number) => void,
	warning: (file: string, message: string, line?: number) => void,
) {
	const file = path.join(packageDir, "package.json");
	let pkg: { name?: unknown; version?: unknown; files?: unknown };
	try {
		pkg = JSON.parse(await fs.readFile(file, "utf-8"));
	} catch (err) {
		error(file, (err as NodeJS.ErrnoException).code === "ENOENT" ? "No package.json — a package is published to npm." : `Not valid JSON: ${(err as Error).message}`);
		return;
	}

	if (typeof pkg.name !== "string" || !pkg.name) error(file, "No \"name\".");
	if (typeof pkg.version !== "string" || !semver.valid(pkg.version)) error(file, `"version" ${JSON.stringify(pkg.version)} isn't a semver version (e.g. 1.0.0).`);

	// Without `files` npm ships everything; with it, the manifest must be in it.
	if (Array.isArray(pkg.files)) {
		const manifest = path.relative(packageDir, manifestPath).split(path.sep).join("/");
		const ships = pkg.files.some((entry) => typeof entry === "string" && shipsFile(entry, manifest));
		if (!ships) warning(file, `"files" doesn't seem to include ${manifest} — the published package would have no manifest.`);
	}
}

/**
 * Whether a package.json `files` entry includes `file` — a rough check: the
 * entry is the file, a folder it's in, or a glob ending in its name or `*.yaml`.
 */
function shipsFile(entry: string, file: string): boolean {
	const clean = entry.replace(/^\.\//, "").replace(/\/$/, "");
	if (clean === file || file.startsWith(`${clean}/`)) return true;
	if (!clean.includes("*")) return false;
	const pattern = new RegExp(`^${clean.split("**").map(part => part.split("*").map(escapeRegExp).join("[^/]*")).join(".*")}$`);
	return pattern.test(file);
}

function escapeRegExp(text: string): string {
	return text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The package's root from what `hio lint` was given: the folder itself, or
 * the folder of a manifest.yaml (its parent, for a board's workspace/manifest.yaml).
 */
async function resolvePackageDir(target: string): Promise<string> {
	const stat = await fs.stat(target).catch(() => null);
	if (!stat?.isFile()) return target;
	const dir = path.dirname(target);
	return path.basename(dir) === "workspace" && !(await isFile(path.join(dir, "package.json"))) ? path.dirname(dir) : dir;
}

/** Reads and parses a YAML file, reporting syntax errors at their line. */
async function readYaml(file: string, error: (file: string, message: string, line?: number) => void): Promise<YamlFile | null> {
	const lines = new LineCounter();
	const doc = parseDocument(await fs.readFile(file, "utf-8"), { lineCounter: lines });
	if (doc.errors.length) {
		// The message's first line, without the " at line N, column M:" the line already says.
		for (const err of doc.errors) error(file, err.message.split("\n")[0]!.replace(/ at line \d+, column \d+:?$/, "."), err.linePos?.[0]?.line);
		return null;
	}
	return { file, doc, lines };
}

/** Reports every issue of a zod error against a YAML file, at the line of what it's about. */
function reportZod(err: ZodError, yaml: YamlFile, data: unknown, prefix: PropertyKey[], error: (file: string, message: string, line?: number) => void) {
	for (const issue of err.issues) {
		const at = [...prefix, ...issue.path];
		error(yaml.file, describe(issue, at, data, issue.path), lineOf(yaml, at));
	}
}

/**
 * A zod issue as a lint message: where it is, what's wrong — and, when zod
 * only says "Invalid input" (a value that fits none of the shapes allowed),
 * the value it got.
 *
 * @param at The path to show (in the file).
 * @param data What was validated, to read the value from.
 * @param valuePath The value's path in `data`, when it differs from `at`.
 */
function describe(issue: ZodError["issues"][number], at: PropertyKey[], data: unknown, valuePath: PropertyKey[] = at): string {
	let message = issue.message;
	if (message === "Invalid input") {
		const value = valuePath.reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<PropertyKey, unknown>)[key] : undefined), data);
		if (value !== undefined && (typeof value !== "object" || value === null)) message += ` — got ${JSON.stringify(value)}`;
	}
	return at.length ? `${formatPath(at)}: ${message}` : message;
}

/** The value as an object to read fields from — `{}` when it isn't one. */
function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * The line of the value at `at` in a YAML file — or, when it isn't there (a
 * missing field), of the closest thing above it that is.
 */
function lineOf(yaml: YamlFile, at: PropertyKey[]): number | undefined {
	for (let depth = at.length; depth >= 0; depth--) {
		const node = yaml.doc.getIn(at.slice(0, depth) as unknown[], true) as { range?: [number, number, number] } | undefined;
		if (node?.range) return yaml.lines.linePos(node.range[0]).line;
	}
	return undefined;
}

/** `["schema", "actions", 0, "script"]` → `schema.actions[0].script`. */
function formatPath(at: PropertyKey[]): string {
	return at.reduce<string>((text, key) => typeof key === "number" ? `${text}[${key}]` : text ? `${text}.${String(key)}` : String(key), "");
}

async function isFile(file: string): Promise<boolean> {
	return fs.stat(file).then(stat => stat.isFile(), () => false);
}
