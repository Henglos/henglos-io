import type { BoardFirmware, BoardPrepareContext } from "@henglosio/runner";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── The board ────────────────────────────────────────────────────────────────
// MicroPython's port and board (its folder under ports/<port>/boards).
const PORT = "rp2";
const BOARD = "RPI_PICO";

// The stock MicroPython for the Pico, written when the board has no firmware of
// its own — same version as the manifest's firmware.micropython. Written by UF2:
// the Pico shows a drive (RPI-RP2) in its bootloader.
const STOCK = "https://micropython.org/resources/firmware/RPI_PICO-20260824-v1.29.0.uf2";

const MICROPYTHON_REPO = "https://github.com/micropython/micropython.git";

type Context = Pick<BoardPrepareContext, "run" | "log">;

export default {

	// Once per MicroPython version (hio runs it under the cache's lock, and only
	// until it succeeds), all in ctx.cache: MicroPython's checkout, the rp2
	// port's submodules (the pico-sdk…), and its mpy-cross — what the runtime and
	// the components are compiled with (the port's build uses it too).
	async prepare(ctx) {
		const micropython = micropythonDir(ctx.cache, ctx.micropython);
		await cloneOnce(ctx, "MicroPython v" + ctx.micropython, MICROPYTHON_REPO, "v" + ctx.micropython, micropython);

		await ctx.log("[prepare] the " + PORT + " port's submodules (pico-sdk…)\n");
		await ctx.run("make", ["-C", path.join(micropython, "ports", PORT), "BOARD=" + BOARD, "submodules"]);

		const mpyCross = path.join(micropython, "mpy-cross");
		await ctx.run("make", ["-C", mpyCross, jobs()]);
		return { mpyCross: path.join(mpyCross, "build", "mpy-cross") };
	},

	// MicroPython with the runtime frozen in, so it runs from flash and the RAM is
	// left to the workflow. Same version and layout as STOCK, so the board's
	// filesystem stays. Incremental: only what changed compiles again.
	async build(ctx) {
		const micropython = micropythonDir(ctx.cache, ctx.micropython);
		const portDir = path.join(micropython, "ports", PORT);
		await ctx.log("[firmware] MicroPython v" + ctx.micropython + " · " + PORT + "/" + BOARD + "\n");

		// No BUILD= here: a variable on make's command line reaches every sub-make,
		// mpy-cross's too. The port's default, build-<BOARD>, sits in the checkout,
		// which is per version already.
		await ctx.run("make", ["-C", portDir, "BOARD=" + BOARD, "FROZEN_MANIFEST=" + ctx.freezeManifest, jobs()]);

		fs.copyFileSync(path.join(portDir, "build-" + BOARD, "firmware.uf2"), ctx.firmwareOutput);
	},

	// ctx.firmware (build's, the runtime frozen in) — or the stock one — by UF2:
	// the driver copies it to the Pico's drive, and the Pico restarts into it. UF2
	// can't erase the flash first (ctx.erase): the filesystem stays where it was.
	async flash(ctx) {
		let firmware = ctx.firmware ?? STOCK;
		if (/^https?:\/\//.test(firmware)) {
			firmware = await downloadOnce(ctx, firmware, path.join(ctx.cache, "firmware", path.basename(firmware.split("?")[0]!)));
		}

		if (ctx.method !== "uf2") throw new Error("The Raspberry Pi Pico is written by UF2 only.");
		await ctx.send("uf2", { file: firmware });
	},

} satisfies BoardFirmware;

// ── Helpers ──────────────────────────────────────────────────────────────────

// Where MicroPython `version` is checked out, in the cache.
const micropythonDir = (cache: string, version: string) => path.join(cache, "micropython", "v" + version);

// As many make jobs as the container has cores.
const jobs = () => "-j" + os.availableParallelism();

// Clones `ref` of `repo` into `dir`, unless it's there already — through a
// .partial folder, so an interrupted clone is never mistaken for a finished one.
async function cloneOnce(ctx: Context, label: string, repo: string, ref: string, dir: string): Promise<void> {
	if (fs.existsSync(path.join(dir, ".git"))) return;
	await ctx.log("[firmware] fetching " + label + "\n");
	const partial = dir + ".partial";
	fs.rmSync(partial, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(dir), { recursive: true });
	await ctx.run("git", ["clone", "--quiet", "--depth", "1", "--branch", ref, repo, partial]);
	fs.renameSync(partial, dir);
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
