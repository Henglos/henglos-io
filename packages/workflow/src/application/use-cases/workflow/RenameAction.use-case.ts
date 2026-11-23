import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";

/** A node's name is at most this long. */
export const MAX_ACTION_ALIAS_LENGTH = 64;

// What it's named: trimmed, cut at MAX_ACTION_ALIAS_LENGTH — and its action's
// own name (base.displayName) when left empty. Only what the studio shows:
// the wire ids come from the node's id and its action's displayName.
const named = (action: IActionRuntime, alias: string): IActionRuntime => {
	const name = alias.trim().slice(0, MAX_ACTION_ALIAS_LENGTH);
	return { ...action, alias: name || action.base.displayName };
};

/** Renames a node — Start included. */
export class RenameWorkflowAction {
	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string, alias: string): IWorkflowRuntime {
		if (workflow.start.id === actionId) {
			return { ...workflow, start: named(workflow.start, alias) };
		}

		const componentIdx = workflow.components.findIndex(c => c.id === componentId);
		if (componentIdx === -1) return workflow;

		const component = workflow.components[componentIdx]!;
		if (!component.actions.some(action => action.id === actionId)) return workflow;

		const components = [...workflow.components];
		components[componentIdx] = {
			...component,
			actions: component.actions.map(action => action.id === actionId ? named(action, alias) : action),
		};
		return { ...workflow, components };
	}
}
