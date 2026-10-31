import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { workflowEntries } from "./WorkflowEntries.js";

// Generous cap against a cyclic graph — well below what the firmware's
// MAX_RECORD_SIZE (4096 bytes) could hold as Execute frames anyway.
const MAX_RECORD_ACTIONS = 512;

// RECORD mode has no on-device execution: the firmware only stores whatever
// Execute frames it's sent (and answers SUCCESS/FALLBACK for the storing, not
// an outputId — see RecordCommand.py), so hosting can't branch on a real outputId the way
// ExecuteWorkflowUseCase does for RUNTIME (ResolveNextAction, which matches a
// connection's sourceHandle against a specific declared output). Instead this
// walks workflow.connections directly by source/target, ignoring which output
// handle each connection is attached to — every action reachable from Start or
// a trigger (each one an entry: the board arms its triggers on its own, see
// MainTask.py) is included exactly once (depth-first, so a branch is fully visited before the
// next sibling branch starts), which also makes this immune to actions that
// declare zero/mismatched outputs (that broke the output-matching approach:
// see ResolveNextAction, which returns undefined when an action has no
// matching declared output, silently truncating the walk).
export class ResolveRecordSequence {

	execute(workflow: IWorkflowRuntime): string[] {

		const sequence: string[] = [];
		const visited = new Set<string>();
		// Reversed: Start is popped first, then the triggers in order.
		const stack: string[] = workflowEntries(workflow).reverse();

		while (stack.length > 0 && sequence.length < MAX_RECORD_ACTIONS) {

			const actionId = stack.pop()!;
			if (visited.has(actionId)) continue;

			visited.add(actionId);
			sequence.push(actionId);

			const nextIds = workflow.connections
				.filter(c => c.source === actionId)
				.map(c => c.target);

			// Pushed in reverse so the first-declared connection out of this
			// action is the next one popped (stack pops from the end).
			for (let i = nextIds.length - 1; i >= 0; i--) stack.push(nextIds[i]!);

		}

		return sequence;

	}

}
