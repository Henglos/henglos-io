import * as path from "path";
import { exit } from "process";
import type { Command } from "commander";
import { lintPackage, type LintReport } from "../core/lint.js";

/**
 * Registers `hio lint [paths...]`.
 *
 * Checks one or more packages (a package folder, or its manifest.yaml; the
 * current folder by default) — see {@link lintPackage} for what's checked.
 * Prints every problem by file and line, and exits with code 1 when any is an
 * error (warnings alone don't fail it).
 *
 * @param cli The `hio` program to add the command to.
 */
export const registerLintCommand = (cli: Command) => {
	const lintCommand = cli.command("lint [paths...]");
	lintCommand.description("check a board, component or platform package — its manifest.yaml and what it points to");
	lintCommand.action(async (paths: string[]) => {

		const targets = paths.length ? paths : ["."];
		let errors = 0;

		for (const target of targets) {
			const report = await lintPackage(path.resolve(process.cwd(), target));
			printReport(report);
			errors += report.issues.filter(issue => issue.level === "error").length;
		}

		if (errors > 0) exit(1);

	});
};

/**
 * Prints a lint report, eslint-style: the package, then each file's problems
 * with their line — or that there are none.
 */
export function printReport(report: LintReport) {
	const relative = (file: string) => path.relative(process.cwd(), file) || ".";
	const kind = report.kind ? ` (${report.kind})` : "";

	if (report.issues.length === 0) {
		console.log(`[+] ${relative(report.packageDir)}${kind} — no problems`);
		return;
	}

	console.log(`[-] ${relative(report.packageDir)}${kind}`);

	const byFile = new Map<string, LintReport["issues"]>();
	for (const issue of report.issues) byFile.set(issue.file, [...(byFile.get(issue.file) ?? []), issue]);

	for (const [file, issues] of byFile) {
		console.log(`\n  ${relative(file)}`);
		for (const issue of issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))) {
			const line = issue.line ? `${issue.line}`.padStart(4) : "    ";
			console.log(`  ${line}  ${issue.level.padEnd(7)}  ${issue.message}`);
		}
	}

	const errors = report.issues.filter(issue => issue.level === "error").length;
	const warnings = report.issues.length - errors;
	console.log(`\n  ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}\n`);
}
