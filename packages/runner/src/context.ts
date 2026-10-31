import type { BoardPackage, ComponentPackage, PlatformPackage } from "@henglosio/shared";

/** What every Runner call gets. */
type BaseContext = {

	/** The workspace folder it works in. */
	workspace: string;
	/** Reports output — to the driver, which passes it on to the studio. */
	log: (data: string) => Promise<void>;

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
	// `settings`, by key) — the build checks them against those declarations.
	settings: Record<string, number>;

}

/** What Runner.flash gets. The platform's Runner writes `board`'s firmware (board.firmware) to `port`. */
export type FlashContext = BaseContext & {

	board: BoardPackage;
	/** The board's serial port — in a container, the driver's RFC 2217 tunnel to it. */
	port: string;
	baudrate: number;
	// A local firmware image to write instead of board.firmware.image.
	firmware?: string;

	advanced: Record<string, unknown>;

}
