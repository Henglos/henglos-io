import { useRunAction } from "./useRunAction";
import { useDebugger } from "./useDebugger";
import type { EditValue, RunValue } from "../components/ActionNode/components/OutputValue.component";
import type { RunActionResult } from "@/shared/api";

export type ActionResult = {
	/** How it ran: "Ran alone" (▶), "Debug · step 3"… */
	title: string;
	output: RunActionResult["output"];
	values: RunValue[];
	ranAt: Date;
	/** Debug mode: write over a value the action published. */
	onEdit?: EditValue;
	busy: boolean;
	/** Absent while the debugger holds it (it goes on the next step). */
	onClose?: () => void;
};

/**
 * What an action shows of its last run — the debugger's step while it's on
 * this action, else its last ▶ — plus the ▶ itself (run, running, error).
 */
export function useActionResult(actionId: string) {

	const runner = useRunAction(actionId);
	const debug = useDebugger();
	const debugRan = debug.session?.state.ran?.actionId === actionId ? debug.session.state.ran : null;
	// Ran earlier in the branch being debugged: what it published then — what
	// it passed on may still be read further down (Pass Context).
	const debugEarlier = !debugRan ? debug.session?.history?.[actionId] ?? null : null;

	const shown: ActionResult | null = debugRan && debug.session
		? {
			title: `Debug · step ${debug.session.state.step}`,
			output: debugRan.output,
			values: debugRan.values,
			ranAt: debug.session.ranAt,
			onEdit: debug.active ? debug.setValue : undefined,
			busy: debug.session.busy,
		}
		: debugEarlier && debug.session
		? {
			title: `Debug · step ${debugEarlier.step}`,
			output: debugEarlier.output,
			values: debugEarlier.values,
			ranAt: debug.session.ranAt,
			busy: false,
		}
		: runner.result && runner.ranAt
			? { title: "Ran alone", output: runner.result.output, values: runner.result.values, ranAt: runner.ranAt, busy: false, onClose: runner.clear }
			: null;

	return { shown, runner, debugging: !!debug.session };

}
