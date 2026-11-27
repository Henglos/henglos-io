import type { FlashBroker, FlashMethodName } from "./broker.js";

/**
 * A board's firmware script: the default export of its manifest's
 * `firmware.script`, run in its `firmware.image`.
 *
 * Written in TypeScript and run by Node as it is, so it needs no build step: use
 * `import type` and no syntax Node would have to transform (no `enum`).
 *
 * The firmware must keep MicroPython's REPL on the serial port, which is how the
 * driver installs the runtime, and match the manifest's `firmware.micropython`.
 *
 * The board is the MicroPython port: `hio` builds the runtime (the platform)
 * and the components with the mpy-cross `prepare` returns, and has the board's
 * script build and write the firmware.
 *
 * `hio` runs `prepare` before `build` and `flash` — under a lock (the cache is
 * shared between workflows), and only until it once succeeds for this script,
 * the board's MicroPython and image, and its `scope: prepare` options: what it
 * returned is kept, and used until then. `build` runs under the same lock.
 */
export type BoardFirmware = {

	/**
	 * Sets up what build and flash need (sources, toolchains) in ctx.cache, and
	 * returns the mpy-cross of the board's MicroPython — its own, so a fork's
	 * bytecode always matches.
	 */
	prepare: (context: BoardPrepareContext) => Promise<BoardPrepareResult> | BoardPrepareResult;
	/**
	 * Optional: builds a firmware with the runtime frozen in. Without it, the
	 * runtime goes on the board's filesystem as .mpy files.
	 */
	build?: (context: BoardBuildContext) => Promise<void> | void;
	flash: (context: BoardFlashContext) => Promise<void> | void;

}

/** What a board's `prepare` returns. */
export type BoardPrepareResult = {

	/**
	 * The mpy-cross executable of the board's MicroPython, in ctx.cache — what the
	 * runtime and the components are compiled with. E.g. MicroPython's
	 * `mpy-cross/build/mpy-cross`, after `make -C mpy-cross`.
	 */
	mpyCross: string;

}

/** What every one of a board's firmware actions gets. */
export type BoardContext = {

	/** The MicroPython version the board's manifest says it runs. */
	micropython: string;
	/** A folder kept between builds, for this board's image: sources, toolchains, build folders. */
	cache: string;
	/**
	 * The board's options (its manifest's `options`): the workflow's values, or
	 * the defaults. `prepare` gets only those with `scope: prepare`.
	 */
	options: Record<string, string>;
	/** Reports output to the studio. */
	log: (data: string) => Promise<void>;
	/**
	 * Runs a command of the image, its output going to the log. No shell is
	 * involved, so an argument is never read as a command. Rejects when it fails.
	 */
	run: (command: string, args?: string[]) => Promise<void>;

}

/**
 * What a board's `prepare` gets: the environment only — no workflow, no board
 * connected. What it sets up must go in `cache`: the container is thrown away,
 * the cache is kept.
 */
export type BoardPrepareContext = BoardContext;

/** What a board's `build` gets. */
export type BoardBuildContext = BoardContext & {

	/**
	 * MicroPython's FROZEN_MANIFEST: the port's own frozen modules
	 * (`$(PORT_DIR)/boards/manifest.py`) plus the runtime.
	 */
	freezeManifest: string;
	/**
	 * A manifest with the runtime only — for a port with no boards/manifest.py,
	 * or a board with a manifest of its own: `include()` it from there.
	 */
	runtimeManifest: string;
	/**
	 * Where to leave a firmware with the runtime frozen in. Left empty, the
	 * runtime goes on the board's filesystem as .mpy files instead.
	 */
	firmwareOutput: string;

}

/**
 * What a board's `flash` gets: `method`, the way the studio picked (one of its
 * manifest's `firmware.methods`), and `send`, which writes by it — see FlashBroker.
 *
 *   if (ctx.method === "uf2") await ctx.send("uf2", { file: firmware });
 *   else await ctx.send("serial", { baudrate: ctx.baudrate, write: ({ url, baudrate }) => ctx.run("esptool", [...]) });
 */
export type BoardFlashContext = BoardContext & Pick<FlashBroker, "send"> & {

	/** The way the studio picked to write the firmware. */
	method: FlashMethodName;

	/** The image `build` made. Absent: write the board's stock MicroPython. */
	firmware?: string;
	/** The speed to write at over serial, when the script names none. */
	baudrate: number;
	/** Whether to erase the flash first. False: the board's filesystem must survive. */
	erase: boolean;

}
