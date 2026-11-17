#!/usr/bin/env node
// Publishes the workspace to the dev Gitea (docker-compose.dev.yaml) — what
// the dev hosting and drivers read — instead of npm and PyPI, whose versions
// can't be taken back:
//
//   pnpm publish:dev                     every package whose version isn't there yet
//   pnpm publish:dev hio-system esp8266  only these (any part of the name)
//   pnpm publish:dev --force cli         replaces a version already there
//   pnpm publish:dev --dry-run           says what it would do
//   pnpm publish:dev --no-build          as they are built now
//
// The npm packages are the workspace's public ones (not "private"); hio-sdk
// goes to Gitea's PyPI. The token (Gitea → Settings → Applications, scope
// package: read and write) comes from GITEA_TOKEN, or from .gitea-token at the
// repository's root (ignored by git). GITEA_URL changes where Gitea is.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GITEA = (process.env.GITEA_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OWNER = "henglosio";
const NPM_REGISTRY = `${GITEA}/api/packages/${OWNER}/npm/`;
const PYPI_URL = `${GITEA}/api/packages/${OWNER}/pypi`;
const SDK_DIR = path.join(ROOT, "packages", "hio-sdk");

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const dryRun = argv.includes("--dry-run");
const build = !argv.includes("--no-build");
const filters = argv.filter(arg => !arg.startsWith("--"));

const fail = (message) => { console.error(`[-] ${message}`); process.exit(1); };

// npm, pnpm and uv are .cmd shims on Windows, which only run through a shell:
// one command line, each argument quoted.
const quote = (arg) => /^[\w@%+=:,./\-]+$/.test(arg) ? arg : `"${arg.replaceAll('"', '\\"')}"`;
const exec = (command, args, options) => spawnSync([command, ...args].map(quote).join(" "), { shell: true, ...options });

// A command, its output shown; fails the script when it does.
function run(command, args, options = {}) {
	const result = exec(command, args, { stdio: "inherit", ...options });
	if (result.status !== 0) fail(`${command} ${args[0] ?? ""} failed (exit ${result.status}).`);
}

function readToken() {
	if (process.env.GITEA_TOKEN) return process.env.GITEA_TOKEN.trim();
	const file = path.join(ROOT, ".gitea-token");
	if (fs.existsSync(file)) return fs.readFileSync(file, "utf-8").trim();
	return fail("No Gitea token: set GITEA_TOKEN, or put it in .gitea-token at the repository's root.");
}

// The org is public: what's there is read without the token.
const read = (url) => fetch(url);
const gitea = (url, init = {}) => fetch(url, { ...init, headers: { authorization: `token ${token}`, ...init.headers } });

// The workspace's public npm packages: name, version, folder.
function npmPackages() {
	const result = exec("pnpm", ["ls", "-r", "--json", "--depth", "-1"], { cwd: ROOT, encoding: "utf-8" });
	if (result.status !== 0) fail("pnpm ls failed.");
	return JSON.parse(result.stdout)
		.filter(pkg => !pkg.private && pkg.name && pkg.version)
		.map(pkg => ({ name: pkg.name, version: pkg.version, dir: pkg.path }));
}

function sdkPackage() {
	const pyproject = fs.readFileSync(path.join(SDK_DIR, "pyproject.toml"), "utf-8");
	const version = /^version\s*=\s*"([^"]+)"/m.exec(pyproject)?.[1];
	if (!version) fail("No version in packages/hio-sdk/pyproject.toml.");
	return { name: "hio-sdk", version, dir: SDK_DIR, pypi: true };
}

const selected = (pkg) => filters.length === 0 || filters.some(filter => pkg.name.includes(filter));

async function npmHasVersion(pkg) {
	const response = await read(`${NPM_REGISTRY}${pkg.name.replace("/", "%2F")}`);
	if (response.status === 404) return false;
	if (!response.ok) fail(`Gitea answered ${response.status} for ${pkg.name} — is it running at ${GITEA}?`);
	const metadata = await response.json();
	return !!metadata.versions?.[pkg.version];
}

async function pypiHasVersion(pkg) {
	const response = await read(`${PYPI_URL}/simple/${pkg.name}/`);
	if (response.status === 404) return false;
	if (!response.ok) fail(`Gitea answered ${response.status} for ${pkg.name} — is it running at ${GITEA}?`);
	return (await response.text()).includes(`hio_sdk-${pkg.version}`);
}

// Gitea doesn't take a version twice: --force removes it first.
async function remove(pkg) {
	const type = pkg.pypi ? "pypi" : "npm";
	const response = await gitea(`${GITEA}/api/v1/packages/${OWNER}/${type}/${encodeURIComponent(pkg.name)}/${pkg.version}`, { method: "DELETE" });
	if (!response.ok && response.status !== 404) fail(`Couldn't remove ${pkg.name}@${pkg.version} (${response.status}).`);
}

function publishNpm(pkg) {
	// The token in a config of its own, for this command only — never on the command line.
	const config = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hio-publish-")), ".npmrc");
	fs.writeFileSync(config, `${NPM_REGISTRY.replace(/^https?:/, "")}:_authToken=${token}\n`);
	try {
		// npm, not pnpm: hio-system's prepack bundles the sdk into the tarball.
		run("npm", ["publish", "--registry", NPM_REGISTRY, "--userconfig", config], { cwd: pkg.dir });
	} finally {
		fs.rmSync(path.dirname(config), { recursive: true, force: true });
	}
}

async function publishPypi(pkg) {
	const out = fs.mkdtempSync(path.join(os.tmpdir(), "hio-sdk-"));
	try {
		run("uv", ["build", "--package", "hio-sdk", "--out-dir", out], { cwd: ROOT });
		run("uv", ["publish", "--publish-url", PYPI_URL, "--username", login, ...fs.readdirSync(out).map(file => path.join(out, file))], {
			cwd: ROOT,
			env: { ...process.env, UV_PUBLISH_PASSWORD: token },
		});
	} finally {
		fs.rmSync(out, { recursive: true, force: true });
	}
}

await read(`${GITEA}/api/v1/version`).catch(() => fail(`No Gitea at ${GITEA} — start it: docker compose -f docker-compose.dev.yaml up -d`));

// A dry run only reads: it needs no token.
const token = dryRun ? "" : readToken();
let login = "";
if (!dryRun) {
	const me = await gitea(`${GITEA}/api/v1/user`);
	if (!me.ok) fail("The Gitea token isn't valid.");
	login = (await me.json()).login;
}
const packages = [...npmPackages(), sdkPackage()].filter(selected);
if (packages.length === 0) fail(`No package matches ${filters.join(", ")}.`);

const pending = [];
for (const pkg of packages) {
	const there = pkg.pypi ? await pypiHasVersion(pkg) : await npmHasVersion(pkg);
	if (there && !force) console.log(`[=] ${pkg.name}@${pkg.version} is already on Gitea`);
	else pending.push({ ...pkg, there });
}

if (pending.length === 0) {
	console.log("[+] Nothing to publish.");
	process.exit(0);
}

console.log(`[>] To publish: ${pending.map(pkg => `${pkg.name}@${pkg.version}`).join(", ")}`);
if (dryRun) process.exit(0);

const npmPending = pending.filter(pkg => !pkg.pypi);
if (build && npmPending.length > 0) {
	run("pnpm", ["turbo", "run", "build", ...npmPending.flatMap(pkg => ["--filter", pkg.name])], { cwd: ROOT });
}

for (const pkg of pending) {
	console.log(`\n[>] ${pkg.name}@${pkg.version}`);
	if (pkg.there) await remove(pkg);
	if (pkg.pypi) await publishPypi(pkg);
	else publishNpm(pkg);
}

console.log(`\n[+] Published ${pending.length} to ${GITEA}.`);
