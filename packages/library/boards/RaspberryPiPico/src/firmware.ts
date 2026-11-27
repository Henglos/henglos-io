import type { BoardFirmware, BoardPrepareContext } from "@henglosio/runner";
import fs from "node:fs";
import path from "node:path";

// ── The board ────────────────────────────────────────────────────────────────
// The stock MicroPython for the Pico (RPI_PICO), written by UF2 — the Pico shows
// a drive (RPI-RP2) in its bootloader, which the driver puts it in through its
// serial port when it isn't there already. Same version as the manifest's
// firmware.micropython.
const STOCK = "https://micropython.org/resources/firmware/RPI_PICO-20260824-v1.29.0.uf2";

const MICROPYTHON_REPO = "https://github.com/micropython/micropython.git";

type Context = Pick<BoardPrepareContext, "run" | "log">;

export default {

	// Once per MicroPython version (hio runs it under the cache's lock, and only
	// until it succeeds): MicroPython's checkout and its mpy-cross — what the
	// runtime and the components are compiled with, for the stock firmware.
	async prepare(ctx) {
		const micropython = path.join(ctx.cache, "micropython", "v" + ctx.micropython);
		await cloneOnce(ctx, "MicroPython v" + ctx.micropython, MICROPYTHON_REPO, "v" + ctx.micropython, micropython);

		const mpyCross = path.join(micropython, "mpy-cross");
		await ctx.run("make", ["-C", mpyCross]);
		return { mpyCross: path.join(mpyCross, "build", "mpy-cross") };
	},

	// No build: the Pico runs the stock MicroPython, and the runtime goes on its
	// filesystem as .mpy files.

	// The firmware, by UF2: the driver copies it to the Pico's drive, and the Pico
	// restarts into it. UF2 can't erase the flash first (ctx.erase): writing the
	// firmware leaves the filesystem where it was — the runtime replaces its files.
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
