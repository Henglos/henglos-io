import type { BoardFirmware, FirmwareBuildContext } from "@henglosio/runner";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── The board ────────────────────────────────────────────────────────────────
// MicroPython's port and board (its folder under ports/<port>/boards), and the
// chip as esptool names it. ESP8266 images start at the beginning of the flash.
const PORT = "esp8266";
const BOARD = "ESP8266_GENERIC";
const CHIP = "esp8266";
const OFFSET = "0x0";

// The module's flash (the FLASH_SIZE option): MicroPython's variant of the board,
// and its stock firmware — written when the board has no firmware of its own.
const VARIANTS: Record<string, { variant: string; stock: string }> = {
	"2MB+": { variant: "", stock: "https://micropython.org/resources/firmware/ESP8266_GENERIC-20260824-v1.29.0.bin" },
	"1MB": { variant: "FLASH_1M", stock: "https://micropython.org/resources/firmware/ESP8266_GENERIC-FLASH_1M-20260824-v1.29.0.bin" },
};

const MICROPYTHON_REPO = "https://github.com/micropython/micropython.git";
// The prebuilt xtensa-lx106 toolchain MicroPython's CI builds the port with
// (tools/ci.sh, ci_esp8266_setup) — x86-64 Linux.
const TOOLCHAIN_URL = "https://micropython.org/resources/xtensa-lx106-elf-standalone.tar.gz";
// The Python tools the port's build runs, at the versions its CI pins: esptool
// turns the ELF into the image (elf2image).
const PYTHON_TOOLS = ["esptool==3.3.1", "pyelftools", "pyserial"];

type Context = Pick<FirmwareBuildContext, "run" | "log">;

export default {

	// Once per MicroPython version (the platform runs it under the cache's lock,
	// and only until it succeeds): the MicroPython checkout, the xtensa-lx106
	// toolchain and the build's Python tools, all in ctx.cache.
	async prepare(ctx) {
		const micropython = path.join(ctx.cache, "micropython", "v" + ctx.micropython);
		await cloneOnce(ctx, "MicroPython v" + ctx.micropython, MICROPYTHON_REPO, "v" + ctx.micropython, micropython, []);

		const toolchain = toolchainPath(ctx.cache);
		if (!fs.existsSync(path.join(toolchain, "bin", "xtensa-lx106-elf-gcc"))) {
			const archive = await downloadOnce(ctx, TOOLCHAIN_URL, path.join(ctx.cache, "downloads", path.basename(TOOLCHAIN_URL)));
			await ctx.log("[prepare] unpacking the xtensa-lx106 toolchain\n");
			const partial = toolchain + ".partial";
			fs.rmSync(partial, { recursive: true, force: true });
			fs.mkdirSync(partial, { recursive: true });
			await ctx.run("tar", ["-xzf", archive, "-C", partial]);
			fs.rmSync(toolchain, { recursive: true, force: true });
			fs.renameSync(path.join(partial, "xtensa-lx106-elf"), toolchain);
			fs.rmSync(partial, { recursive: true, force: true });
			// Its own esptool.py would shadow the pinned one (as in MicroPython's CI).
			fs.rmSync(path.join(toolchain, "bin", "esptool.py"), { force: true });
		}

		const tools = pythonToolsPath(ctx.cache);
		const ready = path.join(tools, ".hio-ready");
		if (!fs.existsSync(ready)) {
			await ctx.log("[prepare] installing " + PYTHON_TOOLS.join(", ") + "\n");
			await ctx.run("python3", ["-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--upgrade", "--target", tools, ...PYTHON_TOOLS]);
			fs.writeFileSync(ready, "");
		}
	},

	// MicroPython with the runtime frozen in, so it runs from flash and the little
	// RAM an ESP8266 has (~80 KB) is left to the workflow. Same version and layout
	// as the stock firmware, so the board's filesystem stays. Incremental: only
	// what changed compiles again.
	async build(ctx) {
		const { variant } = variantOf(ctx.options);
		const micropython = path.join(ctx.cache, "micropython", "v" + ctx.micropython);
		useTools(ctx.cache);
		await ctx.log("[firmware] MicroPython v" + ctx.micropython + " · " + PORT + "/" + BOARD + (variant ? "-" + variant : "") + "\n");

		const name = "v" + ctx.micropython + "-" + PORT + "-" + BOARD + (variant ? "-" + variant : "");
		const buildDir = path.join(ctx.cache, "build", name);
		fs.mkdirSync(buildDir, { recursive: true });

		// The platform's manifest names the port's modules and the runtime; this
		// port only freezes asyncio — which the runtime needs — from its board's
		// own manifest, which the platform's replaces. Added back here.
		const manifest = path.join(buildDir, "hio_manifest.py");
		writeIfChanged(manifest, [
			"include(" + JSON.stringify(ctx.freezeManifest) + ")",
			"include(\"$(MPY_DIR)/extmod/asyncio\")",
			"",
		].join("\n"));

		const jobs = "-j" + os.availableParallelism();
		const portDir = path.join(micropython, "ports", PORT);
		await ctx.run("make", ["-C", path.join(micropython, "mpy-cross"), jobs]);
		await ctx.run("make", ["-C", portDir, "submodules"]);
		await ctx.run("make", [
			"-C", portDir,
			"BOARD=" + BOARD,
			...(variant ? ["BOARD_VARIANT=" + variant] : []),
			"BUILD=" + buildDir,
			"FROZEN_MANIFEST=" + manifest,
			// The pinned esptool (prepare), not the image's.
			"ESPTOOL=python3 -m esptool",
			jobs,
		]);

		fs.copyFileSync(path.join(buildDir, "firmware.bin"), ctx.firmwareOutput);
	},

	// One esptool run, one connection: --erase-all erases within the same
	// session, right before writing. --flash-size detect: the module says its own.
	async flash(ctx) {
		let firmware = ctx.firmware ?? variantOf(ctx.options).stock;
		if (/^https?:\/\//.test(firmware)) {
			firmware = await downloadOnce(ctx, firmware, path.join(ctx.cache, "firmware", path.basename(firmware.split("?")[0]!)));
		}

		await ctx.run("esptool", [
			"--chip", CHIP,
			"--port", ctx.serialUrl,
			"--baud", String(ctx.baudrate),
			"write-flash",
			"--flash-size", "detect",
			...(ctx.erase ? ["--erase-all"] : []),
			"-z", OFFSET, firmware,
		]);
	},

} satisfies BoardFirmware;

// ── Helpers ──────────────────────────────────────────────────────────────────

// The variant the FLASH_SIZE option picks — 2 MB and up when it's not set.
function variantOf(options: Record<string, string>): { variant: string; stock: string } {
	return VARIANTS[options["FLASH_SIZE"] ?? "2MB+"] ?? VARIANTS["2MB+"]!;
}

function toolchainPath(cache: string): string {
	return path.join(cache, "xtensa-lx106-elf");
}

function pythonToolsPath(cache: string): string {
	return path.join(cache, "esp8266-python");
}

// The toolchain and the pinned Python tools, for the commands ctx.run starts —
// it passes this process's environment on.
function useTools(cache: string): void {
	const bin = path.join(toolchainPath(cache), "bin");
	const tools = pythonToolsPath(cache);
	if (!(process.env["PATH"] ?? "").split(path.delimiter).includes(bin)) {
		process.env["PATH"] = bin + path.delimiter + (process.env["PATH"] ?? "");
	}
	process.env["PYTHONPATH"] = tools + (process.env["PYTHONPATH"] ? path.delimiter + process.env["PYTHONPATH"] : "");
}

// Writes `content` to `file` unless it's there already: a new file would make the
// incremental build compile everything again.
function writeIfChanged(file: string, content: string): void {
	if (fs.existsSync(file) && fs.readFileSync(file, "utf-8") === content) return;
	fs.writeFileSync(file, content);
}

// Clones `ref` of `repo` into `dir`, unless it's there already — through a
// .partial folder, so an interrupted clone is never mistaken for a finished one.
async function cloneOnce(ctx: Context, label: string, repo: string, ref: string, dir: string, extra: string[]): Promise<void> {
	if (fs.existsSync(path.join(dir, ".git"))) return;
	await ctx.log("[prepare] fetching " + label + "\n");
	const partial = dir + ".partial";
	fs.rmSync(partial, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(dir), { recursive: true });
	await ctx.run("git", ["clone", "--quiet", "--depth", "1", "--branch", ref, ...extra, repo, partial]);
	fs.renameSync(partial, dir);
}

// Downloads `url` to `file` once — through a .partial file, so a cut download
// is never used.
async function downloadOnce(ctx: Context, url: string, file: string): Promise<string> {
	if (fs.existsSync(file)) return file;
	await ctx.log("[download] " + url + "\n");
	const response = await fetch(url);
	if (!response.ok) throw new Error("Downloading " + url + " failed: HTTP " + response.status);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file + ".partial", Buffer.from(await response.arrayBuffer()));
	fs.renameSync(file + ".partial", file);
	return file;
}
