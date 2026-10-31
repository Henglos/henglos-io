
/** A piece of the Runner's output — a log line or more, as it comes. */
export type RunnerDataPayload = {

	type: "data";
	data: string;

}

/** The Runner failed: `id` says what failed (e.g. "build_failed"), `data` why. */
export type RunnerErrorPayload = {

	type: "error";
	id: string;
	data: string;

}

/**
 * What a Runner reports while it builds or flashes — POSTed to the driver's
 * callback in a container, printed in the terminal otherwise (see the CLI's createSend).
 */
export type RunnerProtocol = RunnerDataPayload | RunnerErrorPayload;
