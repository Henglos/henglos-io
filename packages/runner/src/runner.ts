import type { BuildContext, FlashContext } from "./context.js";

/**
 * What a platform's Runner is — the script its manifest names in
 * `build.script`, run by `hio build` / `hio flash` inside the build container.
 * Each platform version brings its own, so how it builds can change with it.
 */
export type Runner = {

	/** Compiles the platform's runtime and the workflow's components for the board's firmware. */
	build: (context: BuildContext) => Promise<void> | void;
	/** Writes the board's MicroPython firmware to it. */
	flash: (context: FlashContext) => Promise<void> | void;

};
