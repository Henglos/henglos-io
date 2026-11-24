import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { isAxiosError } from "axios";
import type { ContextValue } from "@henglosio/shared";
import { runAction, type RunActionResult } from "@/shared/api";
import { upstreamOf } from "../features/code-editor/codeContextNames";
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

const INT32 = [-(2 ** 31), 2 ** 31 - 1] as const;

/** A value a run showed, as the board takes it back (CONTEXT_SET) — undefined when it can't. */
function toContextValue({ name, type, value }: RunActionResult["values"][number]): ContextValue | undefined {
	if (typeof value === "boolean") return { name, kind: "bool", value };
	if (typeof value === "number") {
		const whole = Number.isInteger(value) && type !== "float" && value >= INT32[0] && value <= INT32[1];
		return whole ? { name, kind: "integer", value } : { name, kind: "float", value };
	}
	if (typeof value === "string") return { name, kind: "string", value };
	if (Array.isArray(value)) {
		return type === "bytes" && value.every(item => Number.isInteger(item) && (item as number) >= 0 && (item as number) <= 255)
			? { name, kind: "bytes", value: value as number[] }
			: { name, kind: "list", value };
	}
	if (value && typeof value === "object") return { name, kind: "object", value: value as Record<string, unknown> };
	return undefined;
}

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
			// What the actions before it showed (their last ▶): it runs reading those, as in the flow.
			// The nearest one's value wins a name two of them publish.
			const before = [...upstreamOf(workflow.data, actionId)].reverse();
			const context = new Map<string, ContextValue>();
			for (const id of before) {
				for (const shown of runs[id]?.result?.values ?? []) {
					const value = toContextValue(shown);
					if (value) context.set(value.name.toLowerCase(), value);
				}
			}
			const outcome = await runAction(driver.id, workflow.id, actionId, device.port, baudrate, [...context.values()]);
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
