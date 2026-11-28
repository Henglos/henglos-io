// The project's era: the major every released package shares (see
// .changeset/README.md). A major is a break between the parts — what one
// version of a package understands of another — so they all go to the next
// one together, and compatible means the same major. Minors and patches stay
// each package's own.
//
// Shared by scripts/major.mjs (opens the next era) and
// scripts/check-majors.mjs (checks everything is on the same one).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The folders the workspace's packages are in (pnpm-workspace.yaml). */
const PACKAGE_DIRS = ["apps", "packages", "packages/library/boards", "packages/library/components"];

export const PLATFORM_DIR = path.join(ROOT, "packages", "hio-system");
export const SDK_PYPROJECT = path.join(ROOT, "packages", "hio-sdk", "pyproject.toml");
export const CLI_TEMPLATES = path.join(ROOT, "apps", "cli", "src", "core", "templates.ts");
export const LIBRARY_DIRS = ["packages/library/boards", "packages/library/components"].map(dir => path.join(ROOT, dir));

/**
 * The npm packages in the era: every public one of the workspace. The private
 * ones aren't released on their own — the bundled packages ship inside the
 * CLI, the hosting and the studio as images tagged with the project's
 * version (vN.x.y), which carries the era too.
 */
export function npmMembers() {
	const members = [];
	for (const dir of PACKAGE_DIRS) {
		const abs = path.join(ROOT, dir);
		if (!fs.existsSync(abs)) continue;
		for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
			const pkgPath = path.join(abs, entry.name, "package.json");
			if (!entry.isDirectory() || !fs.existsSync(pkgPath)) continue;
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
			if (!pkg.private) members.push({ dir: path.join(abs, entry.name), name: pkg.name, version: pkg.version });
		}
	}
	return members;
}

/** The version in hio-sdk's pyproject.toml — the sdk is in the era too (it ships inside hio-system). */
export function sdkVersion() {
	const version = /^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(SDK_PYPROJECT, "utf-8"))?.[1];
	if (!version) throw new Error(`No version in ${SDK_PYPROJECT}.`);
	return version;
}

/** The major of a plain x.y.z version (a prerelease keeps its major). */
export const majorOf = (version) => Number(/^(\d+)\./.exec(version)?.[1] ?? NaN);

/** Every board's and component's manifest.yaml. */
export function libraryManifests() {
	return LIBRARY_DIRS.flatMap(dir => fs.existsSync(dir)
		? fs.readdirSync(dir, { withFileTypes: true })
			.filter(entry => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, "manifest.yaml")))
			.map(entry => path.join(dir, entry.name, "manifest.yaml"))
		: []);
}

/** The `dependences.platform` line of a manifest: its range (group 2), or null. */
export const PLATFORM_RANGE_LINE = /^(dependences:[ \t]*\r?\n(?:[ \t]+[^\n]*\n)*?[ \t]+platform:[ \t]*)(\S[^\r\n]*?)[ \t]*(?=\r?$)/m;

/** The `PLATFORM_RANGE` hio create writes into new packages (apps/cli/src/core/templates.ts). */
export const TEMPLATE_RANGE_LINE = /^(const PLATFORM_RANGE = ")([^"]*)(";)(?=\r?$)/m;

/** The `version:` of the platform's manifest.yaml. */
export const MANIFEST_VERSION_LINE = /^(version:[ \t]*)(\S+)[ \t]*(?=\r?$)/m;

export const rel = (file) => path.relative(ROOT, file).replaceAll("\\", "/");
