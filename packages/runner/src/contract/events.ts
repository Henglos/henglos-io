/** The phases a build or flash goes through — the studio shows each apart. */
export type RunnerPhase = "prepare" | "build" | "flash";

/** A piece of the runner's output — a log line or more, as it comes. */
export type RunnerDataPayload = {

	type: "data";
	data: string;

}

/** The runner failed: `id` says what failed (e.g. "build_failed"), `data` why. */
export type RunnerErrorPayload = {

	type: "error";
	id: string;
	data: string;

}

/** The runner moved to another phase. */
export type RunnerPhasePayload = {

	type: "phase";
	phase: RunnerPhase;

}

/**
 * What the runner reports while it prepares, builds or flashes — POSTed to the
 * driver's callback (HIO_CALLBACK_URL) in a container, printed in the terminal
 * otherwise — see connectDriver.
 */
export type RunnerProtocol = RunnerDataPayload | RunnerErrorPayload | RunnerPhasePayload;
