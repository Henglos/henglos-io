import type { Runner } from "@henglosio/runner";

import { spawn } from "child_process";
import { createHash } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import path from "path";

// The platform's Runner, run by `hio build` / `hio flash` inside the board's
// image (its manifest's firmware.image). It builds the runtime and the workflow's components for the *board's* firmware — a .mpy
// only imports on the MicroPython version it was compiled for, so mpy-cross
// is installed at board.firmware.micropython on demand (cached per version).

const PYTHON = process.env.PYTHON ?? "python3";
const CACHE = process.env.HIO_CACHE ?? "/root/.cache/hio";

type Log = (data: string) => Promise<void>;

// Just the slice of a component manifest's `schema` the build needs.
type ComponentSchema = {
	displayName: string;
	actions?: { displayName: string; script: string }[];
};

// A display name as a Python module name — the same rule as module_name() in
// hio/system/core/services/ComponentLoader.py, which imports what this lays
// out: lowercased, anything outside [a-z0-9_] as "_".
const moduleName = (text: string) => text.toLowerCase().replace(/[^a-z0-9_]/g, "_");

// ── Platform settings ─────────────────────────────────────────────────────────
// The limits a workflow overrides (the manifest's `settings`) aren't compiled
// in: the driver writes them to /hio_settings.json on the board before a
// session, and the runtime reads them at start (hio/system/core/settings.py).
// The firmware doesn't depend on them — one build serves every workflow.

function run(command: string, args: string[], log: Log, env: Record<string, string> = {}): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, { env: { ...process.env, PYTHONUNBUFFERED: "1", ...env } });
		proc.stdout.on("data", (chunk: Buffer) => void log(chunk.toString()));
		proc.stderr.on("data", (chunk: Buffer) => void log(chunk.toString()));
		proc.on("close", code => code === 0 ? resolve() : reject(new Error(`${command} ${args[0] ?? ""} exited with code ${code}`)));
		proc.on("error", reject);
	});
}

// mpy-cross for MicroPython `version`, installed once into the cache. Returns
// the folder to put on PYTHONPATH to run it as `python -m mpy_cross`.
async function mpyCross(version: string, log: Log): Promise<string> {
	const target = path.join(CACHE, "mpy-cross", version);
	if (!existsSync(path.join(target, "mpy_cross"))) {
		await log(`[build] installing mpy-cross ${version}\n`);
		// "==1.29.0.*" also matches the pip package's post releases (1.29.0.post2).
		await run(PYTHON, ["-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--target", target, `mpy-cross==${version}.*`], log);
	}
	return target;
}

function* pythonFiles(dir: string, relative = ""): Generator<string> {
	for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
		if (entry.name === "__pycache__") continue;
		const child = path.posix.join(relative, entry.name);
		if (entry.isDirectory()) yield* pythonFiles(dir, child);
		else if (entry.name.endsWith(".py")) yield child;
	}
}

// ── Frozen firmware ──────────────────────────────────────────────────────────
// A board whose firmware script builds a firmware gets the runtime frozen into
// it: hio/ compiled into the image, so its bytecode runs from flash and the RAM is
// left to the workflow. It must keep the layout of the board's stock firmware, so
// the filesystem (components, files, the stored program) survives a rewrite.

/** What the board's flash holds after a Flash: written by build(), read by the driver. */
export type FirmwareInfo = {
	/** Which build of the runtime is frozen in — the board's hio_build.BUILD_ID. */
	buildId: string;
	micropython: string;
	/** The image, next to this file. */
	image: string;
};

const FIRMWARE_INFO = "firmware.json";
const FIRMWARE_IMAGE = "firmware.bin";
// Where the runtime is laid out for MicroPython's freezer — a fixed path, so
// an incremental build sees the same manifest every time.
const FREEZE_STAGE = "/tmp/hio-freeze";

// What both of the board's firmware actions get (BoardFirmware).
function firmwareContext(context: { board: { firmware: { micropython: string } }; options: Record<string, string>; log: Log }) {
	return {
		micropython: context.board.firmware.micropython,
		cache: CACHE,
		options: context.options,
		log: context.log,
		run: (command: string, args: string[] = []) => run(command, args, context.log),
	};
}

// What goes on the board: the runtime (hio/) and the sdk components import
// (henglosio/sdk — packed into the release, see scripts/bundle-sdk.mjs).
const RUNTIME_PACKAGES = ["hio", "henglosio"];

// The runtime laid out for freezing in FREEZE_STAGE, plus hio_build.py naming the build — returns its id: a hash of
// everything that goes into the image, so an unchanged runtime isn't built
// (or flashed) again.
function stageRuntime(root: string, identity: string): string {

	rmSync(FREEZE_STAGE, { recursive: true, force: true });
	const hash = createHash("sha256").update(identity);

	for (const pkg of RUNTIME_PACKAGES) {
		for (const file of [...pythonFiles(path.join(root, pkg))].sort()) {
			const source = readFileSync(path.join(root, pkg, file));
			const target = path.join(FREEZE_STAGE, pkg, file);
			mkdirSync(path.dirname(target), { recursive: true });
			writeFileSync(target, source);
			hash.update(`\0${pkg}/${file}\0`).update(source);
		}

		// `henglosio` has no __init__.py in the package (a namespace on the
		// host, for henglosio.sdk); on the board, a regular package — not
		// relying on MicroPython's namespace support.
		const init = path.join(FREEZE_STAGE, pkg, "__init__.py");
		if (!existsSync(init)) writeFileSync(init, "");
	}

	const buildId = hash.digest("hex").slice(0, 16);
	writeFileSync(path.join(FREEZE_STAGE, "hio_build.py"), [
		"# Written by the platform's build: which build of the runtime this",
		"# firmware has frozen in — the driver reads it to tell whether a Flash",
		"# has anything to write.",
		`BUILD_ID = "${buildId}"`,
		"",
	].join("\n"));

	return buildId;

}

const PlatformRunner: Runner = {

	// Leaves in platform.build.output exactly what the driver installs on the
	// board:
	//   firmware.bin, firmware.json         the board's MicroPython with the runtime
	//                                       frozen in — when its script builds one
	//   hio/**.mpy, henglosio/**.mpy        or else the runtime, for its filesystem
	//   main.py, boot.py                    plain .py — MicroPython never runs them as .mpy
	// and, for each component in context.components (the driver passes none
	// any more: each session installs only the actions it uses — its
	// BoardInstaller — so this is for a standalone `hio build`):
	//   components/__init__.py
	//   components/<component>/__init__.py
	//   components/<component>/<action>.mpy every action of the component
	//   components/<component>/<module>.mpy the modules the actions share (driver.py...)
	async build(context) {

		// Emptied, not removed: the driver mounts it from the host, and a mount
		// point can't be deleted (EBUSY).
		const output = context.platform.build.output;
		mkdirSync(output, { recursive: true });
		for (const entry of readdirSync(output)) rmSync(path.join(output, entry), { recursive: true, force: true });

		const version = context.board.firmware.micropython;
		const compile = async (source: string, target: string, name: string) => {
			const pythonPath = await mpyCross(version, context.log);
			mkdirSync(path.dirname(target), { recursive: true });
			// -s: the path tracebacks show on the board, instead of the container's.
			await run(PYTHON, ["-m", "mpy_cross", "-o", target, "-s", name, source], context.log, { PYTHONPATH: pythonPath });
		};

		// ── Runtime ───────────────────────────────────────────────────────────
		const root = context.platform.path;
		let modules = 0;

		// Frozen into a firmware the board's script builds. Built only when this
		// runtime (with these options) isn't in the cache yet.
		const script = readFileSync(path.resolve(context.board.path, context.board.firmware.script));
		const identity = JSON.stringify({
			version,
			image: context.board.firmware.image,
			script: createHash("sha256").update(script).digest("hex"),
			options: Object.entries(context.options).sort(([a], [b]) => a.localeCompare(b)),
			platform: context.platform.version,
		});
		const buildId = stageRuntime(root, identity);
		const cached = path.join(CACHE, "firmware", `${buildId}.bin`);

		if (existsSync(cached)) {
			await context.log(`[build] firmware ${buildId}: already built\n`);
		} else {
			const manifest = path.join(FREEZE_STAGE, "manifest.py");
			writeFileSync(manifest, [
				"# The port's own frozen modules (asyncio, requests…), plus the runtime.",
				`include("$(PORT_DIR)/boards/manifest.py")`,
				...RUNTIME_PACKAGES.map(pkg => `package("${pkg}", base_path="${FREEZE_STAGE}")`),
				`module("hio_build.py", base_path="${FREEZE_STAGE}")`,
				"",
			].join("\n"));
			const image = `${cached}.partial`;
			mkdirSync(path.dirname(cached), { recursive: true });
			rmSync(image, { force: true });
			await context.log(`[build] ${context.board.name}'s firmware script, MicroPython ${version} — a first build may fetch its toolchain, and take a while\n`);
			await context.boardFirmware.build({ ...firmwareContext(context), freezeManifest: manifest, firmwareOutput: image });
			// Renamed once complete: a cancelled build never counts as cached.
			if (existsSync(image)) {
				copyFileSync(image, cached);
				rmSync(image, { force: true });
			}
		}

		const frozen = existsSync(cached);

		if (frozen) {

			copyFileSync(cached, path.join(output, FIRMWARE_IMAGE));
			const info: FirmwareInfo = { buildId, micropython: version, image: FIRMWARE_IMAGE };
			writeFileSync(path.join(output, FIRMWARE_INFO), JSON.stringify(info, null, 2));
			modules = RUNTIME_PACKAGES.reduce((total, pkg) => total + [...pythonFiles(path.join(FREEZE_STAGE, pkg))].length, 0);

		} else {

			// From the staged runtime, with its __init__.py files.
			for (const pkg of RUNTIME_PACKAGES) {
				for (const file of pythonFiles(path.join(FREEZE_STAGE, pkg))) {
					const name = `${pkg}/${file}`;
					await compile(path.join(FREEZE_STAGE, name), path.join(output, name.replace(/\.py$/, ".mpy")), name);
					modules++;
				}
			}

		}

		for (const entry of ["main.py", "boot.py"]) {
			const source = path.join(root, entry);
			if (existsSync(source)) copyFileSync(source, path.join(output, entry));
		}

		await context.log(frozen
			? `[build] runtime: ${modules} modules frozen into MicroPython ${version} (${context.board.name})\n`
			: `[build] runtime: ${modules} modules for MicroPython ${version} (${context.board.name})\n`);

		// ── Components ────────────────────────────────────────────────────────
		// One package around all of them (components.<component>.<action>), so
		// no component can shadow a module — see ComponentLoader.py.
		mkdirSync(path.join(output, "components"), { recursive: true });
		writeFileSync(path.join(output, "components", "__init__.py"), "");

		for (const component of context.components) {

			const schema = component.schema as ComponentSchema;
			const folder = path.join(output, "components", moduleName(schema.displayName));
			mkdirSync(folder, { recursive: true });
			writeFileSync(path.join(folder, "__init__.py"), "");

			const prefix = `components/${moduleName(schema.displayName)}`;
			const actionModules = new Set<string>();
			const scripts = new Set<string>();

			for (const action of schema.actions ?? []) {
				const module = moduleName(action.displayName);
				const source = path.resolve(component.path, action.script);
				await compile(source, path.join(folder, `${module}.mpy`), `${prefix}/${module}.mpy`);
				await context.log(`[build] ${schema.displayName}/${action.displayName} -> ${prefix}/${module}.mpy\n`);
				actionModules.add(module);
				scripts.add(source);
			}

			// Support modules: every other .py next to the actions' scripts
			// (e.g. a driver.py the actions share), under its own file name —
			// what the actions' relative imports (`from .driver import ...`)
			// look for.
			for (const directory of new Set([...scripts].map(script => path.dirname(script)))) {
				for (const entry of readdirSync(directory)) {
					const source = path.join(directory, entry);
					if (!entry.endsWith(".py") || entry === "__init__.py" || scripts.has(source)) continue;

					const module = entry.slice(0, -3);
					if (actionModules.has(module)) {
						throw new Error(`${schema.displayName}: ${entry} clashes with the module of an action — rename one of them`);
					}

					await compile(source, path.join(folder, `${module}.mpy`), `${prefix}/${module}.mpy`);
					await context.log(`[build] ${schema.displayName} module ${entry} -> ${prefix}/${module}.mpy\n`);
				}
			}

		}

	},

	// Has the board's script write its MicroPython firmware — its stock one, or
	// `context.firmware` (the one build() made with the runtime frozen in). In the
	// driver's container, the serial port arrives through its RFC2217 tunnel.
	//
	// The flash is erased first unless HIO_FLASH_ERASE=0: the driver keeps it
	// for a board that already runs this MicroPython, so rewriting the firmware
	// (a new runtime) leaves the filesystem — components, files, the stored
	// program — where it was.
	async flash(context) {

		const tunnel = process.env.USB_TUNNEL_PORT;

		await context.boardFirmware.flash({
			...firmwareContext(context),
			...(context.firmware ? { firmware: context.firmware } : {}),
			serialUrl: tunnel ? `rfc2217://${process.env.USB_TUNNEL_HOST ?? "host.docker.internal"}:${tunnel}` : context.port,
			baudrate: context.baudrate,
			erase: process.env.HIO_FLASH_ERASE !== "0",
		});

	},

};

export default PlatformRunner;
