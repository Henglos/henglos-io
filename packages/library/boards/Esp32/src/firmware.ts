import type { BoardFirmware, FirmwareBuildContext } from "@henglosio/runner";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── The board ────────────────────────────────────────────────────────────────
// MicroPython's port and board (its folder under ports/<port>/boards), and the
// chip as ESP-IDF and esptool name it. OFFSET is where the image starts in
// flash — the bootloader's place: 0x1000 on the classic ESP32, 0x0 on the S3/C3.
const PORT = "esp32";
const BOARD = "ESP32_GENERIC";
const CHIP = "esp32";
const OFFSET = "0x1000";

// The stock MicroPython, written when the board has no firmware of its own.
const STOCK = "https://micropython.org/resources/firmware/ESP32_GENERIC-20260824-v1.29.0.bin";

// Appended to the board's mpconfigboard.h. MICROPY_PY_TSTRINGS on: MicroPython
// 1.29 lists its "string" module (t-strings) in the built-in module table
// whatever the board's feature level, but only builds it from FULL_FEATURES up
// (ESP32_GENERIC is EXTRA_FEATURES) — left off, the link fails on mp_module_string.
const CONFIG_OVERRIDES = [
	"",
	"// ── HenglosIO ──────────────────────────────────────────────────────────────",
	"#ifndef MICROPY_PY_TSTRINGS",
	"#define MICROPY_PY_TSTRINGS (1)",
	"#endif",
	"",
].join("\n");

const MICROPYTHON_REPO = "https://github.com/micropython/micropython.git";
const ESP_IDF_REPO = "https://github.com/espressif/esp-idf.git";

type Context = Pick<FirmwareBuildContext, "run" | "log">;

// Where ESP-IDF `version` lives in the cache — and what its install.sh and
// export.sh read (IDF_TOOLS_PATH: ctx.run passes this process's environment on).
function idfPath(cache: string, version: string): string {
	process.env["IDF_TOOLS_PATH"] = path.join(cache, "espressif");
	return path.join(cache, "esp-idf", version);
}

export default {

	// Once per MicroPython version (the platform runs it under the cache's lock,
	// and only until it succeeds): the MicroPython checkout, ESP-IDF — the version
	// MicroPython's CI uses — and its toolchain for the chip, all in ctx.cache.
	async prepare(ctx) {
		const micropython = path.join(ctx.cache, "micropython", "v" + ctx.micropython);
		await cloneOnce(ctx, "MicroPython v" + ctx.micropython, MICROPYTHON_REPO, "v" + ctx.micropython, micropython, []);

		const idfVersion = idfVersionFor(micropython);
		const idf = idfPath(ctx.cache, idfVersion);
		const ready = path.join(idf, ".hio-ready-" + CHIP);
		if (!fs.existsSync(ready)) {
			await cloneOnce(ctx, "ESP-IDF " + idfVersion + " (a few minutes)", ESP_IDF_REPO, idfVersion, idf, ["--recursive", "--shallow-submodules"]);
			await ctx.log("[prepare] installing ESP-IDF's " + CHIP + " toolchain\n");
			await ctx.run(path.join(idf, "install.sh"), [CHIP]);
			fs.writeFileSync(ready, "");
		}
	},

	// MicroPython with the runtime frozen in, so it runs from flash and the RAM is
	// left to the workflow (a runtime loaded from .mpy files costs ~75 KB of an
	// ESP32's ~110). Same version and layout as STOCK, so it's written at the same
	// offset, and the board's filesystem stays. Incremental: only what changed
	// compiles again.
	async build(ctx) {
		const micropython = path.join(ctx.cache, "micropython", "v" + ctx.micropython);
		const idfVersion = idfVersionFor(micropython);
		const idf = idfPath(ctx.cache, idfVersion);
		await ctx.log("[firmware] MicroPython v" + ctx.micropython + " · " + PORT + "/" + BOARD + " · ESP-IDF " + idfVersion + "\n");

		const jobs = "-j" + os.availableParallelism();
		const portDir = path.join(micropython, "ports", PORT);
		await withIdf(ctx, idf, "make", ["-C", path.join(micropython, "mpy-cross"), jobs]);
		await withIdf(ctx, idf, "make", ["-C", portDir, "BOARD=" + BOARD, "submodules"]);

		const boardDir = stageBoard(ctx.cache, ctx.micropython, path.join(portDir, "boards", BOARD));
		const buildDir = path.join(ctx.cache, "build", "v" + ctx.micropython + "-" + PORT + "-" + BOARD);
		await withIdf(ctx, idf, "make", ["-C", portDir, "BOARD_DIR=" + boardDir, "BUILD=" + buildDir, "FROZEN_MANIFEST=" + ctx.freezeManifest, jobs]);

		fs.copyFileSync(path.join(buildDir, "firmware.bin"), ctx.firmwareOutput);
	},

	// One esptool run, one connection: erase-flash and then write-flash would reset
	// the chip in between, and the write has to bring it back into its bootloader
	// through the tunnel — when that fails, the board is left erased. --erase-all
	// erases within the same session, right before writing.
	async flash(ctx) {
		let firmware = ctx.firmware ?? STOCK;
		if (/^https?:\/\//.test(firmware)) {
			firmware = await downloadOnce(ctx, firmware, path.join(ctx.cache, "firmware", path.basename(firmware.split("?")[0]!)));
		}

		await ctx.run("esptool", [
			"--chip", CHIP,
			"--port", ctx.serialUrl,
			"--baud", String(ctx.baudrate),
			"write-flash",
			...(ctx.erase ? ["--erase-all"] : []),
			"-z", OFFSET, firmware,
		]);
	},

} satisfies BoardFirmware;

// ── Helpers ──────────────────────────────────────────────────────────────────

// Clones `ref` of `repo` into `dir`, unless it's there already — through a
// .partial folder, so an interrupted clone is never mistaken for a finished one.
async function cloneOnce(ctx: Context, label: string, repo: string, ref: string, dir: string, extra: string[]): Promise<void> {
	if (fs.existsSync(path.join(dir, ".git"))) return;
	await ctx.log("[firmware] fetching " + label + "\n");
	const partial = dir + ".partial";
	fs.rmSync(partial, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(dir), { recursive: true });
	await ctx.run("git", ["clone", "--quiet", "--depth", "1", "--branch", ref, ...extra, repo, partial]);
	fs.renameSync(partial, dir);
}

// The ESP-IDF a MicroPython checkout builds with: its CI's newest (1.24+: the
// esp32 workflow's IDF_NEWEST_VER), the README's recommended one, or — older
// versions — what tools/ci.sh pins.
function idfVersionFor(micropython: string): string {
	const version = /v\d+\.\d+(\.\d+)?/;
	const read = (file: string) => {
		const full = path.join(micropython, file);
		return fs.existsSync(full) ? fs.readFileSync(full, "utf-8") : "";
	};
	const from = (text: string, line: RegExp) => {
		const match = text.split("\n").find(l => line.test(l))?.match(version);
		return match?.[0];
	};

	const found = from(read(".github/workflows/ports_esp32.yml"), /IDF_NEWEST_VER:/)
		?? from(read("ports/esp32/README.md"), /recommended version of ESP-IDF/i)
		?? from(read("tools/ci.sh"), /IDF_VER=v/);
	if (!found) throw new Error("Can't tell which ESP-IDF this MicroPython builds with.");
	return found;
}

// Runs a command with ESP-IDF's environment (its export.sh) — the arguments go
// to bash as positional parameters, never as part of the script.
function withIdf(ctx: Context, idf: string, command: string, args: string[]): Promise<void> {
	return ctx.run("bash", ["-c", ". \"$0/export.sh\" > /dev/null && exec \"$@\"", idf, command, ...args]);
}

// The board's folder, copied into the cache with CONFIG_OVERRIDES appended to
// its mpconfigboard.h. Replaced only when it changed: new files would make the
// incremental build compile everything again.
function stageBoard(cache: string, micropython: string, source: string): string {
	const target = path.join(cache, "boards", "v" + micropython + "-" + PORT + "-" + BOARD);
	const staged = target + ".staged";

	fs.rmSync(staged, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.cpSync(source, staged, { recursive: true });
	fs.appendFileSync(path.join(staged, "mpconfigboard.h"), CONFIG_OVERRIDES);

	if (sameTree(staged, target)) {
		fs.rmSync(staged, { recursive: true, force: true });
	} else {
		fs.rmSync(target, { recursive: true, force: true });
		fs.renameSync(staged, target);
	}
	return target;
}

// Whether two folders hold the same files with the same contents.
function sameTree(a: string, b: string): boolean {
	if (!fs.existsSync(b)) return false;
	const files = (dir: string) => (fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
		.filter(entry => entry.isFile())
		.map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)))
		.sort();
	const left = files(a);
	const right = files(b);
	return left.length === right.length
		&& left.every((file, i) => file === right[i] && fs.readFileSync(path.join(a, file)).equals(fs.readFileSync(path.join(b, file))));
}

// Downloads `url` to `file` once — through a .partial file, so a cut download
// is never used.
async function downloadOnce(ctx: Context, url: string, file: string): Promise<string> {
	if (fs.existsSync(file)) return file;
	await ctx.log("[flash] downloading " + url + "\n");
	const response = await fetch(url);
	if (!response.ok) throw new Error("Downloading " + url + " failed: HTTP " + response.status);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file + ".partial", Buffer.from(await response.arrayBuffer()));
	fs.renameSync(file + ".partial", file);
	return file;
}
