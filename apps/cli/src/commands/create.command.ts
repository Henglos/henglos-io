import * as path from "path";
import * as fs from "fs/promises";
import { exit } from "process";
import type { Command } from "commander";
import { renderTemplate, toDisplayName, toSlug, TEMPLATE_KINDS, type TemplateKind } from "../core/templates.js";
import { lintPackage } from "../core/lint.js";
import { printReport } from "./lint.command.js";

/**
 * Registers `hio create <kind> <name>`.
 *
 * Writes a complete package — package.json, manifest.yaml, its scripts or
 * schema, a README — into a new folder, ready to edit, lint and publish:
 *
 * - `hio create component "Water Sensor"` → `./component-water-sensor/`, with
 *   one action and one trigger.
 * - `hio create board "My Board"` → `./board-my-board/`, set up for an ESP32.
 *
 * Options:
 * - `--dir` — where to write it (default: `./<kind>-<name>`). Must be empty or new.
 * - `--package-name` — the npm name (default: `<kind>-<name>`; a scope, as in
 *   `@you/component-x`, is yours to add).
 *
 * The result is linted right away, so a template that doesn't pass shows up here.
 *
 * @param cli The `hio` program to add the command to.
 */
export const registerCreateCommand = (cli: Command) => {
	const createCommand = cli.command("create <kind> <name>");
	createCommand.description(`create a package from a template — kind: ${TEMPLATE_KINDS.join(" or ")}`);
	createCommand.option("--dir <path>", "folder to create it in (default: ./<kind>-<name>)");
	createCommand.option("--package-name <name>", "npm package name (default: <kind>-<name>)");
	createCommand.action(async (kind: string, name: string, options: { dir?: string; packageName?: string }) => {

		if (!TEMPLATE_KINDS.includes(kind as TemplateKind)) {
			console.error(`[-] Unknown kind "${kind}" — use ${TEMPLATE_KINDS.join(" or ")}.`);
			exit(1);
		}

		const displayName = toDisplayName(name);
		const slug = toSlug(displayName);
		if (!slug) {
			console.error(`[-] "${name}" has no letters or digits to name the package with.`);
			exit(1);
		}

		const packageName = options.packageName ?? `${kind}-${slug}`;
		const dir = path.resolve(process.cwd(), options.dir ?? `${kind}-${slug}`);

		// Never writes over anything: the folder is new, or empty.
		const existing = await fs.readdir(dir).catch(() => null);
		if (existing && existing.length > 0) {
			console.error(`[-] ${dir} already exists and isn't empty.`);
			exit(1);
		}

		const files = renderTemplate(kind as TemplateKind, { displayName, packageName });
		for (const [relative, content] of Object.entries(files)) {
			const file = path.join(dir, relative);
			await fs.mkdir(path.dirname(file), { recursive: true });
			await fs.writeFile(file, content);
		}

		console.log(`[+] Created ${kind} "${displayName}" (${packageName}) in ${path.relative(process.cwd(), dir) || "."}`);
		for (const relative of Object.keys(files)) console.log(`      ${relative}`);

		const report = await lintPackage(dir);
		if (report.issues.some(issue => issue.level === "error")) {
			printReport(report);
			exit(1);
		}

		console.log(`
Next:
  cd ${path.relative(process.cwd(), dir) || "."}
  # edit manifest.yaml and src/
  hio lint
  npm publish`);

	});
};
