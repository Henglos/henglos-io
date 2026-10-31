import type { Runner } from "@henglosio/runner";

import { spawn } from "child_process";
import { createHash } from "crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { parse as parseYaml } from "yaml";

// The platform's Runner, run by `hio build` / `hio flash` inside the
// platform's container (see Dockerfile next to this file). It builds the
// runtime and the workflow's components for the *board's* firmware — a .mpy
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
// A workflow can override the limits this platform declares in its
// manifest.yaml (`settings`). Each key is a constant assigned in one file of
// the runtime (`file`, under hio/ — SystemConfig.py by default; the protocol's
// in PacketCodec.py): the build compiles those files with the workflow's
// values instead of the defaults written in them.

export type PlatformSetting = {
	key: string;
	displayName: string;
	type: "integer";
	default: number;
	min: number;
	max: number;
	file?: string;
};

// Ties one setting to another (with the overrides applied): `key` must be at
// least / at most `atLeast`/`atMost` + `plus` — checked before compiling.
export type PlatformRule = { key: string; atLeast?: string; atMost?: string; plus?: number; message: string };

const SYSTEM_CONFIG = "system/SystemConfig.py";

type Manifest = { settings?: PlatformSetting[]; rules?: PlatformRule[] };

// What this platform version lets a workflow override.
function declared(root: string): Required<Manifest> {
	const manifest = parseYaml(readFileSync(path.join(root, "manifest.yaml"), "utf-8")) as Manifest;
	return { settings: manifest.settings ?? [], rules: manifest.rules ?? [] };
}

// The workflow's overrides: from the context, or — an `hio` CLI older than
// BuildContext.settings, baked into the build image — straight from the
// runner.map.json the driver wrote next to the workspace.
function workflowSettings(context: { workspace: string; settings?: Record<string, number> }): Record<string, number> {
	if (context.settings) return context.settings;
	const mapPath = path.join(context.workspace, "runner.map.json");
	if (!existsSync(mapPath)) return {};
	try {
		return (JSON.parse(readFileSync(mapPath, "utf-8")) as { settings?: Record<string, number> }).settings ?? {};
	} catch {
		return {};
	}
}

/**
 * The overrides this platform declares, checked: in range, and every rule
 * holding once they're applied over the defaults. Undeclared keys are
 * returned apart (the workflow may come from another platform version) —
 * anything else wrong fails the build.
 */
export function resolveSettings(overrides: Record<string, number>, settings: PlatformSetting[], rules: PlatformRule[]): { values: Map<PlatformSetting, number>; skipped: string[] } {

	const values = new Map<PlatformSetting, number>();
	const skipped: string[] = [];
	const effective: Record<string, number> = Object.fromEntries(settings.map(s => [s.key, s.default]));

	for (const [key, value] of Object.entries(overrides)) {
		const setting = settings.find(s => s.key === key);
		if (!setting) {
			skipped.push(key);
			continue;
		}
		if (!Number.isInteger(value) || value < setting.min || value > setting.max) {
			throw new Error(`Platform setting ${key} = ${value} is out of range (${setting.min}–${setting.max}).`);
		}
		values.set(setting, value);
		effective[key] = value;
	}

	for (const rule of rules) {
		const other = rule.atLeast ?? rule.atMost;
		const value = effective[rule.key];
		const bound = other !== undefined ? effective[other] : undefined;
		if (value === undefined || bound === undefined) continue;
		const limit = bound + (rule.plus ?? 0);
		if (rule.atLeast !== undefined ? value < limit : value > limit) {
			throw new Error(`Platform settings: ${rule.message} (${rule.key} = ${value}, needs ${rule.atLeast !== undefined ? "≥" : "≤"} ${limit}).`);
		}
	}

	return { values, skipped };

}

/**
 * `source` with each of `values` written in: `KEY = const(N)` or `KEY = N`,
 * keeping const() when it was there and whatever follows the value (a
 * trailing comment). A key with no assignment in the file fails the build.
 */
export function applySettings(source: string, file: string, values: Map<PlatformSetting, number>): string {

	for (const [setting, value] of values) {
		if ((setting.file ?? SYSTEM_CONFIG) !== file) continue;

		const line = new RegExp(`^([ \\t]*${setting.key}[ \\t]*=[ \\t]*)(?:const\\(([^)\\n]*)\\)|([^\\n#]*?))([ \\t]*(?:#.*)?)$`, "m");
		const match = source.match(line);
		if (!match) throw new Error(`Platform setting ${setting.key} has no assignment in hio/${file}.`);

		const isConst = match[2] !== undefined;
		source = source.replace(line, (_, head: string, _const, _plain, tail: string) =>
			`${head}${isConst ? `const(${value})` : value}${tail}`);
	}

	return source;

}

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
// A board whose manifest says how to build its MicroPython (firmware.build)
// gets the runtime frozen into its firmware: hio/ compiled into the image, so
// its bytecode runs from flash and the RAM is left to the workflow (a runtime
// loaded from .mpy files costs ~75 KB of an ESP32's ~110). The image is built
// from MicroPython's source with ESP-IDF — both fetched once into the cache,
// a Docker volume every workflow's container shares, so only the first build
// takes long. Same MicroPython version as the board's `image`, same layout:
// it's written at the same offset, over the same partition table — the
// filesystem (components, files, the stored program) stays.

type FirmwareBuild = { port: string; board: string; idf?: string };

/** What the board's flash holds after a Flash: written by build(), read by the driver. */
export type FirmwareInfo = {
	/** Which build of the runtime is frozen in — the board's hio_build.BUILD_ID. */
	buildId: string;
	micropython: string;
	port: string;
	board: string;
	/** The image, next to this file. */
	image: string;
};

const FIRMWARE_INFO = "firmware.json";
const FIRMWARE_IMAGE = "firmware.bin";
// Where the runtime is laid out for MicroPython's freezer — a fixed path, so
// an incremental build sees the same manifest every time.
const FREEZE_STAGE = "/tmp/hio-freeze";

// The board's firmware.build — from its manifest file too: an `hio` CLI older
// than the field strips it from context.board when it validates the manifest.
function firmwareBuild(board: { path: string; firmware: object }): FirmwareBuild | undefined {
	const declared = (board.firmware as { build?: FirmwareBuild }).build;
	if (declared) return declared;
	for (const file of ["workspace/manifest.yaml", "manifest.yaml"]) {
		const manifestPath = path.join(board.path, file);
		if (!existsSync(manifestPath)) continue;
		const manifest = parseYaml(readFileSync(manifestPath, "utf-8")) as { firmware?: { build?: FirmwareBuild } };
		return manifest.firmware?.build;
	}
	return undefined;
}

// Builds MicroPython `version` for `build` with FROZEN_MANIFEST `manifest`
// into `image` — under a lock: the cache (sources, ESP-IDF, build folders) is
// shared by every workflow's container. Each step runs once per version: the
// MicroPython checkout, ESP-IDF (the version MicroPython's CI uses, unless the
// board names one), its toolchain for `chip`; the build itself is incremental.
async function buildFirmware(version: string, build: FirmwareBuild, chip: string, manifest: string, image: string, log: Log): Promise<void> {

	const script = String.raw`
set -eo pipefail
MP="$CACHE/micropython/v$MP_VERSION"
if [ ! -d "$MP/.git" ]; then
	echo "[firmware] fetching MicroPython v$MP_VERSION (once)"
	rm -rf "$MP.partial"
	git clone --quiet --depth 1 --branch "v$MP_VERSION" https://github.com/micropython/micropython.git "$MP.partial"
	mv "$MP.partial" "$MP"
fi

# The ESP-IDF this MicroPython is built with: its CI's newest (1.24+: the
# esp32 workflow's IDF_NEWEST_VER), the README's recommended one, or — older
# versions — what tools/ci.sh pins.
VERSION_RE='v[0-9]+\.[0-9]+(\.[0-9]+)?'
if [ -z "$IDF_VERSION" ] && [ -f "$MP/.github/workflows/ports_esp32.yml" ]; then
	IDF_VERSION=$(grep -E "IDF_NEWEST_VER:" "$MP/.github/workflows/ports_esp32.yml" | grep -oE "$VERSION_RE" | head -n 1 || true)
fi
if [ -z "$IDF_VERSION" ] && [ -f "$MP/ports/esp32/README.md" ]; then
	IDF_VERSION=$(grep -iE "recommended version of ESP-IDF" "$MP/ports/esp32/README.md" | grep -oE "$VERSION_RE" | head -n 1 || true)
fi
if [ -z "$IDF_VERSION" ]; then
	IDF_VERSION=$(grep -oE "IDF_VER=$VERSION_RE" "$MP/tools/ci.sh" | head -n 1 | cut -d= -f2 || true)
fi
if [ -z "$IDF_VERSION" ]; then
	echo "Can't tell which ESP-IDF MicroPython v$MP_VERSION builds with — set firmware.build.idf in the board's manifest." >&2
	exit 1
fi

IDF="$CACHE/esp-idf/$IDF_VERSION"
export IDF_TOOLS_PATH="$CACHE/espressif"
if [ ! -f "$IDF/.hio-ready-$CHIP" ]; then
	if [ ! -d "$IDF/.git" ]; then
		echo "[firmware] fetching ESP-IDF $IDF_VERSION (once — a few minutes)"
		rm -rf "$IDF.partial"
		git clone --quiet --depth 1 --branch "$IDF_VERSION" --recursive --shallow-submodules https://github.com/espressif/esp-idf.git "$IDF.partial"
		mv "$IDF.partial" "$IDF"
	fi
	echo "[firmware] installing ESP-IDF's $CHIP toolchain (once)"
	"$IDF/install.sh" "$CHIP"
	touch "$IDF/.hio-ready-$CHIP"
fi
. "$IDF/export.sh" > /dev/null

echo "[firmware] MicroPython v$MP_VERSION · $PORT/$BOARD · ESP-IDF $IDF_VERSION"
make -C "$MP/mpy-cross" -j"$(nproc)" > /dev/null
make -C "$MP/ports/$PORT" BOARD="$BOARD" submodules > /dev/null

# The board, copied with HenglosIO's overrides appended to its config:
#   MICROPY_PY_TSTRINGS on — MicroPython 1.29 lists its "string" module
#   (t-strings) in the built-in module table whatever the board's feature
#   level, but only builds it from FULL_FEATURES up (ESP32_GENERIC is
#   EXTRA_FEATURES): left off, the link fails on mp_module_string.
# Only replaced when it changed: new files would make the incremental build
# compile everything again.
BOARD_DIR="$CACHE/boards/v$MP_VERSION-$PORT-$BOARD"
STAGED_BOARD="$BOARD_DIR.staged"
rm -rf "$STAGED_BOARD"
mkdir -p "$(dirname "$BOARD_DIR")"
cp -r "$MP/ports/$PORT/boards/$BOARD" "$STAGED_BOARD"
cat >> "$STAGED_BOARD/mpconfigboard.h" <<'OVERRIDES'

// ── HenglosIO ──────────────────────────────────────────────────────────────
#ifndef MICROPY_PY_TSTRINGS
#define MICROPY_PY_TSTRINGS (1)
#endif
OVERRIDES
if diff -rq "$STAGED_BOARD" "$BOARD_DIR" > /dev/null 2>&1; then
	rm -rf "$STAGED_BOARD"
else
	rm -rf "$BOARD_DIR"
	mv "$STAGED_BOARD" "$BOARD_DIR"
fi

BUILD_DIR="$CACHE/build/v$MP_VERSION-$PORT-$BOARD"
make -C "$MP/ports/$PORT" BOARD_DIR="$BOARD_DIR" BUILD="$BUILD_DIR" FROZEN_MANIFEST="$MANIFEST" -j"$(nproc)"
cp "$BUILD_DIR/firmware.bin" "$IMAGE"
`;

	mkdirSync(CACHE, { recursive: true });
	await run("flock", [path.join(CACHE, "firmware.lock"), "bash", "-c", script], log, {
		CACHE,
		MP_VERSION: version,
		IDF_VERSION: build.idf ?? "",
		PORT: build.port,
		BOARD: build.board,
		CHIP: chip,
		MANIFEST: manifest,
		IMAGE: image,
	});

}

// The runtime laid out for freezing in FREEZE_STAGE (the workflow's settings
// written in), plus hio_build.py naming the build — returns its id: a hash of
// everything that goes into the image, so an unchanged runtime isn't built
// (or flashed) again.
function stageRuntime(root: string, rewritten: Map<string, string>, identity: string): string {

	rmSync(FREEZE_STAGE, { recursive: true, force: true });
	const hash = createHash("sha256").update(identity);

	for (const file of [...pythonFiles(path.join(root, "hio"))].sort()) {
		const source = readFileSync(rewritten.get(file) ?? path.join(root, "hio", file));
		const target = path.join(FREEZE_STAGE, "hio", file);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(target, source);
		hash.update(`\0${file}\0`).update(source);
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

// The board's firmware image, downloaded once into the cache.
async function firmwareImage(url: string, log: Log): Promise<string> {
	const file = path.join(CACHE, "firmware", path.basename(new URL(url).pathname));
	if (!existsSync(file)) {
		await log(`[flash] downloading ${url}\n`);
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Firmware download failed (${response.status}): ${url}`);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, Buffer.from(await response.arrayBuffer()));
	}
	return file;
}

const PlatformRunner: Runner = {

	// Leaves in platform.build.output exactly what the driver installs on the
	// board:
	//   firmware.bin, firmware.json         the board's MicroPython with the runtime
	//                                       frozen in — a board with firmware.build
	//   hio/**.mpy                          or else the runtime, for its filesystem
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

		// The workflow's overrides, written into copies of the files that assign
		// them — the package itself is mounted read-only.
		const { settings, rules } = declared(root);
		const { values, skipped } = resolveSettings(workflowSettings(context), settings, rules);
		const rewritten = new Map<string, string>();         // hio/<file> → its rewritten copy
		if (values.size > 0) {
			const temp = mkdtempSync(path.join(os.tmpdir(), "hio-settings-"));
			for (const file of new Set([...values.keys()].map(setting => setting.file ?? SYSTEM_CONFIG))) {
				const copy = path.join(temp, file.replaceAll("/", "__"));
				writeFileSync(copy, applySettings(readFileSync(path.join(root, "hio", file), "utf-8"), file, values));
				rewritten.set(file, copy);
			}
			const changed = [...values].filter(([setting, value]) => value !== setting.default).map(([setting, value]) => `${setting.key}=${value}`);
			if (changed.length) await context.log(`[build] platform settings: ${changed.join(", ")}
`);
		}
		if (skipped.length) await context.log(`[build] platform settings ignored (not settings of this platform version): ${skipped.join(", ")}
`);

		const frozen = firmwareBuild(context.board);

		if (frozen) {

			// Frozen into the board's firmware — see buildFirmware(). Built only
			// when this runtime (with these settings) isn't in the cache yet.
			const identity = JSON.stringify({ version, ...frozen, platform: context.platform.version });
			const buildId = stageRuntime(root, rewritten, identity);
			const cached = path.join(CACHE, "firmware", `${buildId}.bin`);

			if (existsSync(cached)) {
				await context.log(`[build] firmware ${buildId}: already built\n`);
			} else {
				await context.log(`[build] firmware ${buildId}: building MicroPython ${version} with the runtime frozen in — the first time fetches MicroPython and ESP-IDF, and takes a while\n`);
				const manifest = path.join(FREEZE_STAGE, "manifest.py");
				writeFileSync(manifest, [
					"# The port's own frozen modules (asyncio, requests…), plus the runtime.",
					`include("$(PORT_DIR)/boards/manifest.py")`,
					`package("hio", base_path="${FREEZE_STAGE}")`,
					`module("hio_build.py", base_path="${FREEZE_STAGE}")`,
					"",
				].join("\n"));
				const image = `${cached}.partial`;
				mkdirSync(path.dirname(cached), { recursive: true });
				await buildFirmware(version, frozen, context.board.firmware.flash.chip, manifest, image, context.log);
				// Renamed once complete: a cancelled build never counts as cached.
				copyFileSync(image, cached);
				rmSync(image, { force: true });
			}

			copyFileSync(cached, path.join(output, FIRMWARE_IMAGE));
			const info: FirmwareInfo = { buildId, micropython: version, port: frozen.port, board: frozen.board, image: FIRMWARE_IMAGE };
			writeFileSync(path.join(output, FIRMWARE_INFO), JSON.stringify(info, null, 2));
			modules = [...pythonFiles(path.join(root, "hio"))].length;

		} else {

			for (const file of pythonFiles(path.join(root, "hio"))) {
				const name = `hio/${file}`;
				const source = rewritten.get(file) ?? path.join(root, name);
				await compile(source, path.join(output, name.replace(/\.py$/, ".mpy")), name);
				modules++;
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

	// Writes the board's MicroPython firmware — the board's official image, or
	// `context.firmware` (the one build() made with the runtime frozen in).
	// The serial port reaches the container through the driver's RFC2217
	// tunnel; esptool drives DTR/RTS over it to enter the bootloader.
	//
	// The flash is erased first unless HIO_FLASH_ERASE=0: the driver keeps it
	// for a board that already runs this MicroPython, so rewriting the firmware
	// (a new runtime) leaves the filesystem — components, files, the stored
	// program — where it was.
	async flash(context) {

		const host = process.env.USB_TUNNEL_HOST ?? "host.docker.internal";
		const port = process.env.USB_TUNNEL_PORT;
		if (!port) throw new Error("USB_TUNNEL_PORT is not set");

		const { flash, image } = context.board.firmware;
		const firmware = context.firmware ?? await firmwareImage(image, context.log);
		const common = ["--chip", flash.chip, "--port", `rfc2217://${host}:${port}`, "--baud", String(context.baudrate)];

		// One esptool run, one connection: erase-flash and then write-flash would
		// reset the chip in between, and the write has to bring it back into its
		// bootloader through the tunnel — when that fails, the board is left
		// erased. --erase-all erases within the same session, right before writing.
		const erase = process.env.HIO_FLASH_ERASE !== "0" ? ["--erase-all"] : [];
		await run("esptool", [...common, "write-flash", ...erase, "-z", flash.offset, firmware], context.log);

	},

};

export default PlatformRunner;
