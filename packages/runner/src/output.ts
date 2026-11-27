// What passes between `hio`, in the build container, and the driver, on the
// host: what a build leaves for the driver to install, and the modules a
// session compiles with the board's mpy-cross.

/** Where the build container leaves the build: the driver mounts its build folder here. */
export const BUILD_OUTPUT = "/workspace/build";

/** In the build, when the board's script froze the runtime into a firmware: a FirmwareInfo. */
export const FIRMWARE_INFO = "firmware.json";

/** In the build: the firmware the board's script built, with the runtime frozen in. */
export const FIRMWARE_IMAGE = "firmware.bin";

/** In every build: a BuildInfo — not installed on the board. */
export const BUILD_INFO = "build.json";

/** What BUILD_INFO holds. */
export type BuildInfo = {

	/** The sha256 of the board's mpy-cross (its prepare's) — what compiled the build. */
	mpyCross: string;
	micropython: string;

};

/**
 * What the driver hands `hio compile` (runner-host.mjs compile --input): the
 * modules a session installs, to compile with the board's mpy-cross.
 */
export type CompileRequest = {

	/** `name`: the path tracebacks on the board show (components/display/print.py). */
	modules: { name: string; source: string }[];

};

/** What `hio compile` leaves (--output). */
export type CompileResult = {

	/** The sha256 of the mpy-cross that compiled them. */
	mpyCross: string;
	/** Each module that compiled, as base64 .mpy, by name. */
	mpy: Record<string, string>;
	/** Each module that didn't, with mpy-cross's errors, by name. */
	errors: Record<string, string>;

};

/** What FIRMWARE_INFO holds. */
export type FirmwareInfo = {

	/** Which build of the runtime is frozen in — the board's hio_build.BUILD_ID. */
	buildId: string;
	micropython: string;
	/** The image, next to FIRMWARE_INFO. */
	image: string;

};
