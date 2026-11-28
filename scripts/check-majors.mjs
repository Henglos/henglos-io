#!/usr/bin/env node
// Checks the project is on one era (see scripts/era.mjs, .changeset/README.md):
//
//   - every released package — the public npm ones and hio-sdk — has the same major;
//   - hio-system's manifest.yaml says the version its package.json does;
//   - every board and component accepts that hio-system version, and no
//     earlier era (a range left over from before the last major);
//   - hio create writes the era's range into new packages.
//
// Run by `pnpm version-packages` and `pnpm release`; on its own: `pnpm check:majors`.
// Exits 1 with every problem found.

import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import {
	CLI_TEMPLATES, MANIFEST_VERSION_LINE, PLATFORM_DIR, PLATFORM_RANGE_LINE, SDK_PYPROJECT, TEMPLATE_RANGE_LINE,
	libraryManifests, majorOf, npmMembers, rel, sdkVersion,
} from "./era.mjs";

const problems = [];

// ── One major ──────────────────────────────────────────────────────────────────

const members = [
	...npmMembers().map(member => ({ name: member.name, version: member.version })),
	{ name: `hio-sdk (${rel(SDK_PYPROJECT)})`, version: sdkVersion() },
];
const era = Math.max(...members.map(member => majorOf(member.version)));
const behind = members.filter(member => majorOf(member.version) !== era);
for (const member of behind) problems.push(`${member.name} is on ${member.version}, not the era's major ${era} — run \`pnpm major\` to put everything on the next one.`);

// ── The platform ───────────────────────────────────────────────────────────────

const platformVersion = JSON.parse(fs.readFileSync(path.join(PLATFORM_DIR, "package.json"), "utf-8")).version;
const platformManifest = path.join(PLATFORM_DIR, "manifest.yaml");
const manifestVersion = MANIFEST_VERSION_LINE.exec(fs.readFileSync(platformManifest, "utf-8"))?.[2];
if (manifestVersion !== platformVersion) problems.push(`${rel(platformManifest)} says version ${manifestVersion ?? "(none)"}, its package.json ${platformVersion} — make them the same.`);

// ── Boards and components ──────────────────────────────────────────────────────

for (const manifest of libraryManifests()) {
	const range = PLATFORM_RANGE_LINE.exec(fs.readFileSync(manifest, "utf-8"))?.[2];
	if (!range || !semver.validRange(range)) {
		problems.push(`${rel(manifest)}: dependences.platform ${range ? `"${range}" isn't a semver range` : "is missing"}.`);
		continue;
	}
	if (!semver.satisfies(platformVersion, range, { includePrerelease: true })) {
		problems.push(`${rel(manifest)}: platform ${range} doesn't accept hio-system ${platformVersion}.`);
	} else if (semver.minVersion(range)?.major !== era) {
		problems.push(`${rel(manifest)}: platform ${range} still accepts an earlier era — make it ^${era}.0.0 (or ^${era}.x.0 when it needs a newer minor).`);
	}
}

// ── hio create ─────────────────────────────────────────────────────────────────

const templateRange = TEMPLATE_RANGE_LINE.exec(fs.readFileSync(CLI_TEMPLATES, "utf-8"))?.[2];
if (templateRange !== `^${era}.0.0`) problems.push(`${rel(CLI_TEMPLATES)}: PLATFORM_RANGE is ${templateRange ?? "(not found)"}, not ^${era}.0.0.`);

if (problems.length > 0) {
	console.error(`[-] Not on one era (major ${era}):\n${problems.map(problem => `    - ${problem}`).join("\n")}`);
	process.exit(1);
}
console.log(`[+] Era ${era}: ${members.length} packages, hio-system ${platformVersion}, every board and component on it.`);
