import { atom } from "jotai";
import type { DebugState } from "@/shared/api";

// The open debug session (debug mode — the flow one action at a time), or
// null when there's none. Read by the controls in the bottom bar and by every
// node: the one that just ran shows its outputs, the next one is marked.
export type DebugSession = {
	driverId: string;
	/** Where it started: Start, or the trigger it listens for. */
	entryId: string;
	state: DebugState;
	/** When the last step ran — for the output windows' header. */
	ranAt: Date;
	/** A request to the board is in flight (Continue, a value edit). */
	busy: boolean;
	/** Why the last request failed — the session is gone after a failed step. */
	error: string | null;
	/**
	 * What each action of the branch published the last time it ran, by
	 * action id — so what an earlier action passed on (Pass Context) still
	 * shows once the flow has moved past it. Starts over with each branch.
	 */
	history?: Record<string, DebugRan>;
};

export type DebugRan = NonNullable<DebugState["ran"]> & { step: number };

/** `session` moved on to `state`: the step it ran joins the branch's history. */
export const withDebugState = (session: DebugSession, state: DebugState): DebugSession => {
	// A new branch: its trigger fired after listening, or Start ran again (a loop).
	const fresh = session.state.status === "listening" || state.ran?.actionId === session.entryId;
	const history = fresh ? {} : { ...session.history };
	if (state.ran && (fresh || state.step !== session.state.step)) history[state.ran.actionId] = { ...state.ran, step: state.step };
	return { ...session, state, history };
};

export const DebugSessionAtom = atom<DebugSession | null>(null);
