import type { RunnerPhase } from "./context.js";


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

/** The Runner moved to another phase — see BaseContext.phase. */
export type RunnerPhasePayload = {

	type: "phase";
	phase: RunnerPhase;

}

/**
 * What a Runner reports while it builds or flashes — POSTed to the driver's
 * callback in a container, printed in the terminal otherwise (see the CLI's createSend).
 */
export type RunnerProtocol = RunnerDataPayload | RunnerErrorPayload | RunnerPhasePayload;
