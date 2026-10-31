import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { isAxiosError } from "axios";
import { runAction, type RunActionResult } from "@/shared/api";
import { BaurateAtom, DeviceSelectionAtom, DriverConnectionAtom } from "../store/driver.store";
import { WorkflowAtom } from "../store/workflow.store";
import { ActiveTaskIdAtom } from "../store/logs.store";

type RunActionState = {
	running: boolean;
	result: RunActionResult | null;
	error: string | null;
	ranAt: Date | null;
};

const IDLE: RunActionState = { running: false, result: null, error: null, ranAt: null };

/** The last ▶ of each action, by its id. */
const RunActionStateAtom = atom<Record<string, RunActionState>>({});

/**
 * The ▶ on a node: runs `actionId` alone on the selected board — outside the
 * flow (a RUN frame), with the configs on screen — and keeps what it did.
 * The board's log of it shows in the bottom bar like any task's.
 */
export function useRunAction(actionId: string) {

	const workflow = useAtomValue(WorkflowAtom);
	const driver = useAtomValue(DriverConnectionAtom);
	const device = useAtomValue(DeviceSelectionAtom);
	const baudrateOverride = useAtomValue(BaurateAtom);
	const setActiveTaskId = useSetAtom(ActiveTaskIdAtom);

	// Per action, in an atom: the compact node and the inspector both show it,
	// and it outlives selecting another action.
	const [runs, setRuns] = useAtom(RunActionStateAtom);
	const { running, result, error, ranAt } = runs[actionId] ?? IDLE;
	const patch = (changes: Partial<RunActionState>) =>
		setRuns(previous => ({ ...previous, [actionId]: { ...(previous[actionId] ?? IDLE), ...changes } }));
	const setRunning = (value: boolean) => patch({ running: value });
	const setResult = (value: RunActionResult | null) => patch({ result: value });
	const setError = (value: string | null) => patch({ error: value });
	const setRanAt = (value: Date | null) => patch({ ranAt: value });

	// Same choice as useBaudrate: the override while the board still offers it, else its default.
	const baudrates: number[] = workflow?.data.board.base.connection.serial?.baudrates ?? [];
	const baudrate = baudrateOverride !== null && baudrates.includes(baudrateOverride) ? baudrateOverride : baudrates[0] ?? null;

	const unavailable =
		!driver ? "Connect a driver to run this action"
		: !device ? "Pick the board to run it on"
		: baudrate === null ? "This board has no serial baud rate to talk at"
		: null;

	const run = async () => {
		if (!workflow || !driver || !device || baudrate === null || running) return;
		setRunning(true);
		setError(null);
		try {
			const outcome = await runAction(driver.id, workflow.id, actionId, device.port, baudrate);
			setResult(outcome);
			setRanAt(new Date());
			setActiveTaskId(outcome.taskId);
		} catch (err) {
			setResult(null);
			// BaseError.toResponseString(): { id, info } — or a plain message.
			const data = isAxiosError(err) ? err.response?.data as { id?: string; info?: string; message?: string } | undefined : undefined;
			setError(data?.info ?? data?.message ?? data?.id ?? (err instanceof Error ? err.message : String(err)));
		} finally {
			setRunning(false);
		}
	};

	const clear = () => {
		setResult(null);
		setError(null);
	};

	return { run, running, result, ranAt, error, unavailable, clear };

}
