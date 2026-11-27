// How a board gets the runtime: prepare, build and flash, run inside the build
// container (the board's image) — by the runner host the driver injects
// (dist/runner-host.mjs), and by `hio build` / `hio flash` / `hio firmware`.
// Bundled into the runner host: Node's own modules only.
//
// The platform is the runtime and has no code of its own; the board is the
// MicroPython port. So this builds the runtime (and the components) with the
// mpy-cross the board's `prepare` returns, and has the board's script build a
// firmware with the runtime frozen in, and write it.

import { spawn } from "child_process";
import { createHash } from "crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import type { BoardPackage, ComponentPackage, PlatformPackage } from "@henglosio/shared";
import {
	BUILD_INFO,
	FIRMWARE_IMAGE,
	FIRMWARE_INFO,
	type BoardContext,
	type BuildInfo,
	type CompileRequest,
	type CompileResult,
	type BoardFirmware,
	type BoardPrepareResult,
	type FirmwareInfo,
	type FlashBroker,
	type FlashMethodName,
	type RunnerPhase,
} from "@henglosio/runner";

/** The cache kept between builds — a volume per image, mounted by the driver. */
const CACHE = process.env.HIO_CACHE ?? "/root/.cache/hio";

// Where the runtime is laid out for MicroPython's freezer — a fixed path, so an
// incremental build sees the same manifest every time.
const FREEZE_STAGE = "/tmp/hio-freeze";

type Log = (data: string) => Promise<void>;

/** What every action works on: the board, its script, and where to report. */
export type FirmwareJob = {

	board: BoardPackage;
	boardFirmware: BoardFirmware;
	/** The board's options, by key: the workflow's values, or the defaults. */
	options: Record<string, string>;
	log: Log;
	phase: (phase: RunnerPhase) => Promise<void>;

};

/** What `buildFirmware` gets besides the job. */
export type BuildJob = FirmwareJob & {

	platform: PlatformPackage;
	components: ComponentPackage[];
	/** Where the build goes — emptied first. */
	output: string;

};

/** What `flashFirmware` gets besides the job. */
export type FlashJob = FirmwareJob & {

	method: FlashMethodName;
	baudrate: number;
	broker: FlashBroker;
	/** A firmware to write instead of the board's stock one. */
	firmware?: string;
	/** Whether to erase the flash first. */
	erase: boolean;

};

// ── Commands ─────────────────────────────────────────────────────────────────

/** Runs `command` with no shell, its output going to `log`. Rejects when it fails. */
function run(command: string, args: string[], log: Log): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, { env: { ...process.env, PYTHONUNBUFFERED: "1" } });
		proc.stdout.on("data", (chunk: Buffer) => void log(chunk.toString()));
		proc.stderr.on("data", (chunk: Buffer) => void log(chunk.toString()));
		proc.on("close", code => code === 0 ? resolve() : reject(new Error(`${command} ${args[0] ?? ""} exited with code ${code}`)));
		proc.on("error", reject);
	});
}

/** Runs `command` with no shell, and resolves to how it ended and what it printed. */
function capture(command: string, args: string[]): Promise<{ code: number | null; output: string }> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args);
		let output = "";
		proc.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
		proc.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
		proc.on("close", code => resolve({ code, output }));
		proc.on("error", reject);
	});
}

// What every one of the board's script actions gets.
function boardContext(job: FirmwareJob, options: Record<string, string>): BoardContext {
	return {
		micropython: job.board.firmware.micropython,
		cache: CACHE,
		options,
		log: job.log,
		run: (command, args = []) => run(command, args, job.log),
	};
}

// The options whose scope is one of `scopes` (an undeclared key counts as build), sorted.
function scopedOptions(job: FirmwareJob, scopes: string[]): Record<string, string> {
	const declared = new Map((job.board.options ?? []).map(option => [option.key, option.scope ?? "build"]));
	return Object.fromEntries(Object.entries(job.options)
		.filter(([key]) => scopes.includes(declared.get(key) ?? "build"))
		.sort(([a], [b]) => a.localeCompare(b)));
}

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

// The board's firmware script, hashed — a changed script prepares and builds again.
const scriptHash = (board: BoardPackage) => sha256(readFileSync(path.resolve(board.path, board.firmware.script)));

// ── The cache's lock ─────────────────────────────────────────────────────────

/**
 * Runs `fn` holding the cache's lock — flock(1), so it holds across the
 * containers sharing the cache and goes with this process. Where there's no
 * flock (a local `hio build` on another OS), it runs unlocked.
 */
async function withCacheLock<T>(fn: () => Promise<T>): Promise<T> {
	mkdirSync(CACHE, { recursive: true });
	const holder = spawn("flock", [path.join(CACHE, "firmware.lock"), "sh", "-c", "echo locked; exec cat"], { stdio: ["pipe", "pipe", "inherit"] });
	const exited = new Promise<void>(resolve => holder.on("close", () => resolve()));

	const locked = await new Promise<boolean>((resolve, reject) => {
		holder.stdout.on("data", (chunk: Buffer) => { if (chunk.toString().includes("locked")) resolve(true); });
		holder.on("error", (error: NodeJS.ErrnoException) => error.code === "ENOENT" ? resolve(false) : reject(error));
		holder.on("close", code => reject(new Error(`flock exited with code ${code} before taking the lock`)));
	});

	try {
		return await fn();
	} finally {
		if (locked) {
			holder.stdin.end();
			await exited;
		}
	}
}

// ── Prepare ──────────────────────────────────────────────────────────────────
// The board's prepare runs once for this script, its MicroPython and image and
// its `scope: prepare` options: what it returned is kept in a marker, written
// last (an interrupted prepare runs again), and used until then — unless the
// mpy-cross it named is gone.

// Call it holding the cache's lock.
async function prepareBoard(job: FirmwareJob, force: boolean): Promise<BoardPrepareResult> {

	const options = scopedOptions(job, ["prepare"]);
	const key = sha256(JSON.stringify({
		script: scriptHash(job.board),
		micropython: job.board.firmware.micropython,
		image: job.board.firmware.image,
		options,
	})).slice(0, 16);
	const marker = path.join(CACHE, "prepared", `${key}.json`);

	if (!force && existsSync(marker)) {
		const kept = JSON.parse(readFileSync(marker, "utf-8")) as Partial<BoardPrepareResult>;
		if (typeof kept.mpyCross === "string" && existsSync(kept.mpyCross)) return { mpyCross: kept.mpyCross };
	}

	await job.phase("prepare");
	await job.log(`[prepare] ${job.board.name}'s environment, MicroPython ${job.board.firmware.micropython} — once; a first one may take a while\n`);
	const result = await job.boardFirmware.prepare(boardContext(job, options)) as Partial<BoardPrepareResult> | undefined;

	const mpyCross = result?.mpyCross;
	if (typeof mpyCross !== "string" || !mpyCross) {
		throw new Error(`${job.board.firmware.script}: prepare must return { mpyCross } — the mpy-cross of the board's MicroPython.`);
	}
	if (!existsSync(mpyCross)) {
		throw new Error(`${job.board.firmware.script}: prepare returned mpyCross ${mpyCross}, which isn't there.`);
	}

	mkdirSync(path.dirname(marker), { recursive: true });
	writeFileSync(marker, JSON.stringify({ mpyCross, prepared: new Date().toISOString() }, null, 2));
	return { mpyCross };

}

/**
 * Runs the board's `prepare` — unless it already succeeded for this script, its
 * MicroPython and image and its `scope: prepare` options, or `force`.
 *
 * @returns What it returned: the mpy-cross of the board's MicroPython.
 */
export function prepareFirmware(job: FirmwareJob, force = false): Promise<BoardPrepareResult> {
	return withCacheLock(() => prepareBoard(job, force));
}

// ── The runtime ──────────────────────────────────────────────────────────────

function* pythonFiles(dir: string, relative = ""): Generator<string> {
	for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
		if (entry.name === "__pycache__") continue;
		const child = path.posix.join(relative, entry.name);
		if (entry.isDirectory()) yield* pythonFiles(dir, child);
		else if (entry.name.endsWith(".py")) yield child;
	}
}

/**
 * Lays the runtime's packages out in FREEZE_STAGE, plus hio_build.py naming the
 * build. Returns its id: a hash of `identity` and of everything that goes into
 * the image, so an unchanged runtime isn't built (or flashed) again.
 */
function stageRuntime(platform: PlatformPackage, identity: string): string {

	rmSync(FREEZE_STAGE, { recursive: true, force: true });
	const hash = createHash("sha256").update(identity);

	for (const pkg of platform.runtime.packages) {
		const root = path.join(platform.path, pkg);
		if (!existsSync(root)) throw new Error(`The platform's runtime package ${pkg}/ isn't in ${platform.path}.`);

		for (const file of [...pythonFiles(root)].sort()) {
			const source = readFileSync(path.join(root, file));
			const target = path.join(FREEZE_STAGE, pkg, file);
			mkdirSync(path.dirname(target), { recursive: true });
			writeFileSync(target, source);
			hash.update(`\0${pkg}/${file}\0`).update(source);
		}

		// A package without __init__.py (henglosio, a namespace on the host) is a
		// regular one on the board — not relying on MicroPython's namespace support.
		const init = path.join(FREEZE_STAGE, pkg, "__init__.py");
		if (!existsSync(init)) writeFileSync(init, "");
	}

	const buildId = hash.digest("hex").slice(0, 16);
	writeFileSync(path.join(FREEZE_STAGE, "hio_build.py"), [
		"# Written by hio's build: which build of the runtime this firmware has",
		"# frozen in — the driver reads it to tell whether a Flash has anything to write.",
		`BUILD_ID = "${buildId}"`,
		"",
	].join("\n"));

	return buildId;

}

/** The manifests the board's build freezes: the runtime alone, and the port's own modules plus it. */
function writeManifests(platform: PlatformPackage): { runtimeManifest: string; freezeManifest: string } {
	const runtimeManifest = path.join(FREEZE_STAGE, "runtime_manifest.py");
	writeFileSync(runtimeManifest, [
		"# The HenglosIO runtime.",
		...platform.runtime.packages.map(pkg => `package("${pkg}", base_path="${FREEZE_STAGE}")`),
		`module("hio_build.py", base_path="${FREEZE_STAGE}")`,
		"",
	].join("\n"));

	const freezeManifest = path.join(FREEZE_STAGE, "manifest.py");
	writeFileSync(freezeManifest, [
		"# The port's own frozen modules (asyncio, requests…), plus the runtime.",
		`include("$(PORT_DIR)/boards/manifest.py")`,
		`include("${runtimeManifest}")`,
		"",
	].join("\n"));

	return { runtimeManifest, freezeManifest };
}

// ── Components ───────────────────────────────────────────────────────────────

// Just the slice of a component manifest's `schema` the build needs.
type ComponentSchema = {
	displayName: string;
	actions?: { displayName: string; script: string }[];
};

// A display name as a Python module name — the same rule as module_name() in
// the runtime's hio/system/core/services/ComponentLoader.py, which imports what
// this lays out: lowercased, anything outside [a-z0-9_] as "_".
const moduleName = (text: string) => text.toLowerCase().replace(/[^a-z0-9_]/g, "_");

type Compile = (source: string, target: string, name: string) => Promise<void>;

/**
 * Each component, in one package around all of them (components.<component>.<action>),
 * so no component can shadow a module:
 *   components/<component>/<action>.mpy   every action of the component
 *   components/<component>/<module>.mpy   the modules the actions share (driver.py…)
 */
async function buildComponents(components: ComponentPackage[], output: string, compile: Compile, log: Log): Promise<void> {

	mkdirSync(path.join(output, "components"), { recursive: true });
	writeFileSync(path.join(output, "components", "__init__.py"), "");

	for (const component of components) {

		const schema = component.schema as ComponentSchema;
		const prefix = `components/${moduleName(schema.displayName)}`;
		const folder = path.join(output, prefix);
		mkdirSync(folder, { recursive: true });
		writeFileSync(path.join(folder, "__init__.py"), "");

		const actionModules = new Set<string>();
		const scripts = new Set<string>();

		for (const action of schema.actions ?? []) {
			const module = moduleName(action.displayName);
			const source = path.resolve(component.path, action.script);
			await compile(source, path.join(folder, `${module}.mpy`), `${prefix}/${module}.mpy`);
			await log(`[build] ${schema.displayName}/${action.displayName} -> ${prefix}/${module}.mpy\n`);
			actionModules.add(module);
			scripts.add(source);
		}

		// Every other .py next to the actions' scripts, under its own name — what
		// the actions' relative imports (`from .driver import ...`) look for.
		for (const directory of new Set([...scripts].map(script => path.dirname(script)))) {
			for (const entry of readdirSync(directory)) {
				const source = path.join(directory, entry);
				if (!entry.endsWith(".py") || entry === "__init__.py" || scripts.has(source)) continue;

				const module = entry.slice(0, -3);
				if (actionModules.has(module)) {
					throw new Error(`${schema.displayName}: ${entry} clashes with the module of an action — rename one of them`);
				}

				await compile(source, path.join(folder, `${module}.mpy`), `${prefix}/${module}.mpy`);
				await log(`[build] ${schema.displayName} module ${entry} -> ${prefix}/${module}.mpy\n`);
			}
		}

	}

}

// ── Build ────────────────────────────────────────────────────────────────────

/**
 * Builds what the driver installs on the board, into `output`:
 *   build.json                    which mpy-cross built it (not installed)
 *   firmware.bin, firmware.json   the board's MicroPython with the runtime frozen
 *                                 in — when its script has a `build`
 *   <package>/**.mpy              or else the runtime, for its filesystem
 *   main.py, boot.py…             the runtime's files, as they are
 *   components/…                  the components, when there are any
 * All compiled with the mpy-cross the board's `prepare` returned.
 */
export async function buildFirmware(job: BuildJob): Promise<void> {

	const { board, platform, output, log } = job;
	const version = board.firmware.micropython;

	// Emptied, not removed: the driver mounts it from the host, and a mount
	// point can't be deleted (EBUSY).
	mkdirSync(output, { recursive: true });
	for (const entry of readdirSync(output)) rmSync(path.join(output, entry), { recursive: true, force: true });

	const { mpyCross } = await prepareFirmware(job);
	await job.phase("build");

	const compile: Compile = async (source, target, name) => {
		mkdirSync(path.dirname(target), { recursive: true });
		// -s: the path tracebacks show on the board, instead of the container's.
		await run(mpyCross, ["-o", target, "-s", name, source], log);
	};

	// What makes a firmware: `scope: runtime` options don't — they go to the board.
	const identity = JSON.stringify({
		version,
		image: board.firmware.image,
		script: scriptHash(board),
		mpyCross: sha256(readFileSync(mpyCross)),
		options: Object.entries(scopedOptions(job, ["prepare", "build"])),
		platform: platform.version,
	});
	const buildId = stageRuntime(platform, identity);
	const buildInfo: BuildInfo = { mpyCross: sha256(readFileSync(mpyCross)), micropython: version };
	writeFileSync(path.join(output, BUILD_INFO), JSON.stringify(buildInfo, null, 2));

	// ── Frozen into a firmware, when the board's script builds one ────────────
	const build = job.boardFirmware.build;
	const cached = path.join(CACHE, "firmware", `${buildId}.bin`);

	if (build && existsSync(cached)) {
		await log(`[build] firmware ${buildId}: already built\n`);
	} else if (build) {
		const manifests = writeManifests(platform);
		const image = `${cached}.partial`;
		mkdirSync(path.dirname(cached), { recursive: true });
		rmSync(image, { force: true });
		await withCacheLock(async () => {
			await log(`[build] ${board.name}'s firmware script, MicroPython ${version}\n`);
			await build({ ...boardContext(job, job.options), ...manifests, firmwareOutput: image });
		});
		// Renamed once complete: a cancelled build never counts as cached.
		if (existsSync(image)) {
			copyFileSync(image, cached);
			rmSync(image, { force: true });
		}
	}

	const frozen = build !== undefined && existsSync(cached);
	let modules = 0;

	if (frozen) {
		copyFileSync(cached, path.join(output, FIRMWARE_IMAGE));
		const info: FirmwareInfo = { buildId, micropython: version, image: FIRMWARE_IMAGE };
		writeFileSync(path.join(output, FIRMWARE_INFO), JSON.stringify(info, null, 2));
		for (const pkg of platform.runtime.packages) modules += [...pythonFiles(path.join(FREEZE_STAGE, pkg))].length;
	} else {
		// From the staged runtime, with its __init__.py files.
		for (const pkg of platform.runtime.packages) {
			for (const file of pythonFiles(path.join(FREEZE_STAGE, pkg))) {
				const name = `${pkg}/${file}`;
				await compile(path.join(FREEZE_STAGE, name), path.join(output, name.replace(/\.py$/, ".mpy")), name);
				modules++;
			}
		}
	}

	for (const file of platform.runtime.files) {
		const target = path.join(output, file);
		mkdirSync(path.dirname(target), { recursive: true });
		copyFileSync(path.join(platform.path, file), target);
	}

	await log(frozen
		? `[build] runtime: ${modules} modules frozen into MicroPython ${version} (${board.name})\n`
		: `[build] runtime: ${modules} modules for MicroPython ${version} (${board.name})\n`);

	if (job.components.length) await buildComponents(job.components, output, compile, log);

}

// ── Compile ──────────────────────────────────────────────────────────────────

/**
 * Compiles `request.modules` with the board's mpy-cross — what a session
 * installs on the board (the driver's BoardInstaller). A module that doesn't
 * compile (a syntax error) is in `errors`, not thrown.
 */
export async function compileModules(job: FirmwareJob, request: CompileRequest): Promise<CompileResult> {

	const { mpyCross } = await prepareFirmware(job);
	const result: CompileResult = { mpyCross: sha256(readFileSync(mpyCross)), mpy: {}, errors: {} };
	const dir = mkdtempSync(path.join(os.tmpdir(), "hio-compile-"));

	try {
		for (const [i, { name, source }] of request.modules.entries()) {
			const input = path.join(dir, `${i}.py`);
			const output = path.join(dir, `${i}.mpy`);
			writeFileSync(input, source);
			// -s: the path tracebacks show on the board.
			const { code, output: printed } = await capture(mpyCross, ["-o", output, "-s", name, input]);
			if (code === 0 && existsSync(output)) result.mpy[name] = readFileSync(output).toString("base64");
			else result.errors[name] = printed.trim() || `mpy-cross exited with code ${code}`;
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}

	return result;

}

// ── Flash ────────────────────────────────────────────────────────────────────

/**
 * Has the board's script write its MicroPython firmware — its stock one, or
 * `job.firmware` (the one `buildFirmware` made) — by `job.method`, through the
 * driver's broker. The lock only while preparing: a flash holds a board, not
 * the cache — other workflows' builds go on meanwhile.
 */
export async function flashFirmware(job: FlashJob): Promise<void> {

	await prepareFirmware(job);
	await job.phase("flash");

	await job.boardFirmware.flash({
		...boardContext(job, job.options),
		...(job.firmware ? { firmware: job.firmware } : {}),
		method: job.method,
		baudrate: job.baudrate,
		erase: job.erase,
		send: job.broker.send,
	});

}
