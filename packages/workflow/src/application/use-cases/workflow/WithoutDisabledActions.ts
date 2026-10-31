import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IConnectionRuntime } from "../../../domain/entities/IConnection.runtime.js";
import { FALLBACK_HANDLE_NAME, getActionOutputs } from "./ResolveNextAction.use-case.js";

/**
 * The workflow as it runs: its disabled actions taken out, and every wire that
 * led into one led on to where that action's Success output goes — the flow
 * passes straight through it. A chain of disabled actions is passed through
 * as a whole; a disabled action with nothing after it ends that path (in loop
 * mode the flow goes back to Start, as from any action with nothing connected).
 *
 * Execute, Debug and Record run this, not the stored workflow — a disabled
 * action never reaches the board. A config bound to a disabled action's output
 * reads nothing, as with any action that didn't run.
 */
export function withoutDisabledActions(workflow: IWorkflowRuntime): IWorkflowRuntime {

	const disabled = new Map<string, IActionRuntime>();
	for (const component of workflow.components) {
		for (const action of component.actions) {
			if (action.disabled) disabled.set(action.id, action);
		}
	}
	if (disabled.size === 0) return workflow;

	// Where the flow goes on from a disabled action: its Success output's
	// targets — the first real output, for an action that branches — followed
	// on through any disabled ones.
	const passOn = (actionId: string, seen: Set<string>): { target: string; targetHandle: string }[] => {
		if (seen.has(actionId)) return []; // a loop of disabled actions leads nowhere
		seen.add(actionId);

		const action = disabled.get(actionId)!;
		const success = getActionOutputs(action).find(output => output.base.id !== FALLBACK_HANDLE_NAME);
		if (!success) return [];

		return workflow.connections
			.filter(connection => connection.source === actionId && connection.sourceHandle === success.id)
			.flatMap(connection => disabled.has(connection.target)
				? passOn(connection.target, seen)
				: [{ target: connection.target, targetHandle: connection.targetHandle }]);
	};

	const connections: IConnectionRuntime[] = [];
	for (const connection of workflow.connections) {
		if (disabled.has(connection.source)) continue;
		if (!disabled.has(connection.target)) {
			connections.push(connection);
			continue;
		}
		passOn(connection.target, new Set()).forEach((next, i) => {
			connections.push({ ...connection, id: `${connection.id}~${i}`, target: next.target, targetHandle: next.targetHandle });
		});
	}

	return {
		...workflow,
		components: workflow.components.map(component => ({
			...component,
			actions: component.actions.filter(action => !disabled.has(action.id)),
		})),
		connections,
	};

}
