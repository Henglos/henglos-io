import type { BoardPackage, ComponentPackage, PlatformPackage } from "@henglosio/shared";

/** What every Runner call gets. */
type BaseContext = {

	/** The workspace folder it works in. */
	workspace: string;
	/** Reports output — to the driver, which passes it on to the studio. */
	log: (data: string) => Promise<void>;
	/**
	 * Says which phase the Runner is in ("prepare", "build", "flash") — the
	 * studio shows each apart. Absent from an older `hio`: phases aren't reported.
	 */
	phase?: (phase: RunnerPhase) => Promise<void>;

}

/** The phases a Runner goes through — see BaseContext.phase. */
export type RunnerPhase = "prepare" | "build" | "flash";

/** What every one of a board's firmware actions gets. */
type FirmwareContext = {

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
 * What a board's firmware `prepare` gets: the environment only — no workflow,
 * no board connected. What it sets up must go in `cache`: the container is
 * thrown away, the cache is kept.
 */
export type FirmwarePrepareContext = FirmwareContext;

/** What a board's firmware `build` gets. */
export type FirmwareBuildContext = FirmwareContext & {

	/** MicroPython's FROZEN_MANIFEST: the runtime, frozen into the firmware. */
	freezeManifest: string;
	/**
	 * Where to leave a firmware with that manifest frozen in. Left empty, the
	 * runtime goes on the board's filesystem as .mpy files instead.
	 */
	firmwareOutput: string;

}

/** What a board's firmware `flash` gets. */
export type FirmwareFlashContext = FirmwareContext & {

	/** The image `build` made. Absent: write the board's stock MicroPython. */
	firmware?: string;
	/** The board's serial port, as a URL the image's tools can open (rfc2217://…). */
	serialUrl: string;
	baudrate: number;
	/** Whether to erase the flash first. False: the board's filesystem must survive. */
	erase: boolean;

}

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
 * The platform runs `prepare` before `build` and `flash` — under a lock (the
 * cache is shared between workflows), and only until it once succeeds for the
 * board's version, its MicroPython and its `scope: prepare` options. `build`
 * and `flash` run under the same lock.
 */
export type BoardFirmware = {

	/** Optional: sets up what build and flash need (sources, toolchains) in ctx.cache. */
	prepare?: (context: FirmwarePrepareContext) => Promise<void> | void;
	build: (context: FirmwareBuildContext) => Promise<void> | void;
	flash: (context: FirmwareFlashContext) => Promise<void> | void;

}

/**
 * What Runner.build gets. The platform's Runner builds itself for `board`
 * (its firmware version) along with the workflow's components, into
 * platform.build.output.
 */
export type BuildContext =  BaseContext & {

	platform: PlatformPackage;
	board: BoardPackage;
	components: ComponentPackage[];

	// The workflow's overrides of the platform's settings (its manifest's
	// `settings`, by key). From hio-system 1.3.0 they aren't compiled in — the
	// runtime reads them on the board — but older platforms' builds still use them.
	settings: Record<string, number>;

	/** The board's firmware script. */
	boardFirmware: BoardFirmware;
	/** The board's options, by key — see FirmwareContext. */
	options: Record<string, string>;

}

/** What Runner.flash gets. The platform's Runner has the board's script write its firmware to `port`. */
export type FlashContext = BaseContext & {

	board: BoardPackage;
	/** The board's serial port — in a container, the driver's RFC 2217 tunnel to it. */
	port: string;
	baudrate: number;
	// A firmware image to write instead of the board's stock one.
	firmware?: string;

	/** The board's firmware script. */
	boardFirmware: BoardFirmware;
	/** The board's options, by key — see FirmwareContext. */
	options: Record<string, string>;

	advanced: Record<string, unknown>;

}
