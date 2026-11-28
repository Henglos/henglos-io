#!/usr/bin/env node
// Opens the next era (see scripts/era.mjs, .changeset/README.md): every
// released package goes to N.0.0 together — for a break between the parts
// (a board schema the hosting can't read, a protocol the driver no longer
// speaks, an sdk call that's gone).
//
//   pnpm major "What broke, in one line — goes into every CHANGELOG"
//   pnpm major --dry-run "…"     says what it would change
//
// Writes, for N = the highest major now + 1:
//   - every public package's version (N.0.0) and a "Major Changes" entry in its CHANGELOG.md;
//   - hio-sdk's pyproject.toml version, and hio-system's manifest.yaml `version`;
//   - every board's and component's dependences.platform: ^N.0.0;
//   - the range hio create writes into new packages.
// Not through changesets: a major there adds one to each package's own major,
// which keeps packages on different ones. Pending changesets must be applied
// first (`pnpm version-packages`), so the major is a release of its own.
//
// Then: review, commit, `pnpm release`, tag the repo vN.0.0, `uv publish` hio-sdk.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
	CLI_TEMPLATES, MANIFEST_VERSION_LINE, PLATFORM_DIR, PLATFORM_RANGE_LINE, ROOT, SDK_PYPROJECT, TEMPLATE_RANGE_LINE,
	libraryManifests, majorOf, npmMembers, rel, sdkVersion,
} from "./era.mjs";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const summary = argv.filter(arg => !arg.startsWith("--")).join(" ").trim();

const fail = (message) => { console.error(`[-] ${message}`); process.exit(1); };

if (!summary) fail('Say what broke: pnpm major "The board schema\'s pins are a map — hosting N-1 can\'t read it."');

const pending = fs.readdirSync(path.join(ROOT, ".changeset")).filter(file => file.endsWith(".md") && file !== "README.md");
if (pending.length > 0) fail(`Pending changesets (${pending.join(", ")}) — apply them first: pnpm version-packages, and commit.`);

const members = npmMembers();
const current = Math.max(...members.map(member => majorOf(member.version)), majorOf(sdkVersion()));
const next = current + 1;
const version = `${next}.0.0`;
const range = `^${version}`;

console.log(`[*] Era ${current} → ${next}${dryRun ? " (dry run)" : ""}`);

/** Rewrites a file through `edit`, keeping its line endings. */
function rewrite(file, edit) {
	const before = fs.readFileSync(file, "utf-8");
	const after = edit(before, before.includes("\r\n") ? "\r\n" : "\n");
	if (after === before) return false;
	if (!dryRun) fs.writeFileSync(file, after);
	return true;
}

/** Replaces group 2 of `pattern`'s match (the value between groups 1 and 3, if any) with `value`. */
// (After the groups, replace's callback gets the offset — a number, not a group.)
const replaceValue = (pattern, value) => (text) => text.replace(pattern, (_match, before, _old, after) => `${before}${value}${typeof after === "string" ? after : ""}`);

// ── npm packages ───────────────────────────────────────────────────────────────

for (const member of members) {
	rewrite(path.join(member.dir, "package.json"), text => text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`));

	const changelog = path.join(member.dir, "CHANGELOG.md");
	if (!fs.existsSync(changelog) && !dryRun) fs.writeFileSync(changelog, `# ${member.name}\n`);
	if (fs.existsSync(changelog)) {
		rewrite(changelog, (text, eol) => {
			const entry = [`## ${version}`, "", "### Major Changes", "", `- ${summary}`, ""].join(eol);
			const header = new RegExp(`^# [^\\r\\n]*${eol === "\r\n" ? "\\r\\n" : "\\n"}(?:\\r?\\n)?`);
			const match = header.exec(text);
			return match ? `${match[0]}${entry}${eol}${text.slice(match[0].length)}` : `# ${member.name}${eol}${eol}${entry}${eol}${text}`;
		});
	}
	console.log(`    ${member.name}: ${member.version} → ${version}`);
}

// ── hio-sdk and the platform's manifest ────────────────────────────────────────

const sdkBefore = sdkVersion();
rewrite(SDK_PYPROJECT, text => text.replace(/^(version\s*=\s*")[^"]*(")/m, `$1${version}$2`));
console.log(`    hio-sdk: ${sdkBefore} → ${version}`);

const platformManifest = path.join(PLATFORM_DIR, "manifest.yaml");
if (!MANIFEST_VERSION_LINE.test(fs.readFileSync(platformManifest, "utf-8"))) fail(`No version: in ${rel(platformManifest)}.`);
rewrite(platformManifest, replaceValue(MANIFEST_VERSION_LINE, version));

// ── Boards, components, hio create ─────────────────────────────────────────────

for (const manifest of libraryManifests()) {
	if (!PLATFORM_RANGE_LINE.test(fs.readFileSync(manifest, "utf-8"))) fail(`No dependences.platform in ${rel(manifest)}.`);
	rewrite(manifest, replaceValue(PLATFORM_RANGE_LINE, range));
}
console.log(`    ${libraryManifests().length} boards and components: platform ${range}`);

if (!TEMPLATE_RANGE_LINE.test(fs.readFileSync(CLI_TEMPLATES, "utf-8"))) fail(`No PLATFORM_RANGE in ${rel(CLI_TEMPLATES)}.`);
rewrite(CLI_TEMPLATES, replaceValue(TEMPLATE_RANGE_LINE, range));
console.log(`    hio create: platform ${range}`);

if (dryRun) process.exit(0);

const check = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-majors.mjs")], { stdio: "inherit" });
if (check.status !== 0) process.exit(check.status ?? 1);

console.log(`\nNext: review the diff, commit, \`pnpm release\`, tag the repo v${version}, and \`uv publish\` hio-sdk.`);
