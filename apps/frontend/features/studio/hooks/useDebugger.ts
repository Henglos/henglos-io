import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { isAxiosError } from "axios";
import { emitToast } from "@henglosio/ui";
import { debugContinue, debugSetValues, debugStart, debugStop, type DebugState, type DebugValue, type RunActionResult } from "@/shared/api";
import { BaurateAtom, DeviceSelectionAtom, DriverConnectionAtom } from "../store/driver.store";
import { WorkflowAtom } from "../store/workflow.store";
import { ActiveTaskIdAtom } from "../store/logs.store";
import { DebugSessionAtom, withDebugState } from "../store/debug.store";

const reasonOf = (err: unknown) => {
	// BaseError.toResponseString(): { id, info } — or a plain message.
	const data = isAxiosError(err) ? err.response?.data as { id?: string; info?: string; message?: string } | undefined : undefined;
	return data?.info ?? data?.message ?? data?.id ?? (err instanceof Error ? err.message : String(err));
};

/**
 * Debug mode: the flow on the selected board, one action at a time. start()
 * runs Start and pauses; next() runs the next action and pauses again —
 * reading the workflow as it is then, so configs edited while paused apply;
 * setValue() overwrites what the last action published before the next reads
 * it; stop() ends it. The board's log shows in the bottom bar like any task's.
 *
 * start(triggerId) debugs from a trigger instead: the session listens until
 * it fires, pauses through its branch, then listens again.
 */
export function useDebugger() {

	const store = useStore();
	const workflow = useAtomValue(WorkflowAtom);
	const driver = useAtomValue(DriverConnectionAtom);
	const device = useAtomValue(DeviceSelectionAtom);
	const baudrateOverride = useAtomValue(BaurateAtom);
	const setActiveTaskId = useSetAtom(ActiveTaskIdAtom);
	const [session, setSession] = useAtom(DebugSessionAtom);

	// Same choice as useBaudrate: the override while the board still offers it, else its default.
	const baudrates: number[] = workflow?.data.board.base.connection.serial?.baudrates ?? [];
	const baudrate = baudrateOverride !== null && baudrates.includes(baudrateOverride) ? baudrateOverride : baudrates[0] ?? null;

	const unavailable =
		!driver ? "Connect a driver to debug"
		: !device ? "Pick the board to debug on"
		: baudrate === null ? "This board has no serial baud rate to talk at"
		: null;

	const active = !!session && session.state.status === "paused";
	const listening = !!session && session.state.status === "listening";

	// While the session listens: Continue after Continue (each waits a while
	// on the board) until the trigger fires — or the session is stopped.
	const listen = async (sessionId: string) => {
		for (;;) {
			const current = store.get(DebugSessionAtom);
			if (!current || current.state.sessionId !== sessionId || current.state.status !== "listening") return;
			let state: DebugState;
			try {
				state = await debugContinue(current.driverId, sessionId);
			} catch (err) {
				if (store.get(DebugSessionAtom)?.state.sessionId !== sessionId) return;  // stopped meanwhile
				store.set(DebugSessionAtom, null);
				emitToast("error", `Debug: ${reasonOf(err)}`);
				return;
			}
			const now = store.get(DebugSessionAtom);
			if (!now || now.state.sessionId !== sessionId) return;
			store.set(DebugSessionAtom, { ...withDebugState(now, state), ranAt: state.step !== now.state.step ? new Date() : now.ranAt, busy: false, error: null });
		}
	};

	const start = async (entryId?: string) => {
		if (!workflow || !driver || !device || baudrate === null || session?.busy) return;
		setSession(prev => prev && { ...prev, busy: true });
		try {
			const state = await debugStart(driver.id, workflow.id, device.port, baudrate, entryId);
			const opened = { driverId: driver.id, entryId: entryId ?? workflow.data.start.id, state, ranAt: new Date(), busy: false, error: null };
			setSession(withDebugState({ ...opened, state: { ...state, status: "listening" } }, state));
			setActiveTaskId(state.sessionId);
			if (state.status === "listening") void listen(state.sessionId);
		} catch (err) {
			setSession(null);
			emitToast("error", `Debug: ${reasonOf(err)}`);
		}
	};

	const next = async () => {
		if (!session || session.busy || session.state.status !== "paused") return;
		setSession({ ...session, busy: true, error: null });
		try {
			const state = await debugContinue(session.driverId, session.state.sessionId);
			setSession({ ...withDebugState(session, state), ranAt: new Date(), busy: false, error: null });
			if (state.status === "finished") emitToast("success", "Debug: the flow is over.");
			if (state.status === "listening") void listen(state.sessionId);
		} catch (err) {
			// A failed step ends the session on the server.
			setSession(null);
			emitToast("error", `Debug: ${reasonOf(err)}`);
		}
	};

	const setValue = async (value: DebugValue, display: RunActionResult["values"][number]["value"]) => {
		if (!session || session.busy || !session.state.ran) return false;
		setSession({ ...session, busy: true });
		try {
			await debugSetValues(session.driverId, session.state.sessionId, [value]);
			// Show the edited value as what the action published.
			const ran = session.state.ran;
			const edited = { ...ran, values: ran.values.map(entry => entry.name === value.name ? { ...entry, value: display } : entry) };
			setSession({
				...session,
				busy: false,
				state: { ...session.state, ran: edited },
				history: { ...session.history, [ran.actionId]: { ...edited, step: session.state.step } },
			});
			return true;
		} catch (err) {
			setSession(null);
			emitToast("error", `Debug: ${reasonOf(err)}`);
			return false;
		}
	};

	const stop = async () => {
		if (!session) return;
		const { driverId, state } = session;
		setSession(null);
		if (state.status !== "finished") await debugStop(driverId, state.sessionId).catch(() => {});
	};

	return { session, active, listening, unavailable, start, next, setValue, stop, listen };

}
