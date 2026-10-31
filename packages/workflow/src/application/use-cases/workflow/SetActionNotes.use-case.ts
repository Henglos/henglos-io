import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";

// Empty notes are dropped instead of stored as "" — the field stays absent
// on actions that never had one.
const withNotes = (action: IActionRuntime, notes: string): IActionRuntime => {
	const { notes: _previous, ...rest } = action;
	return notes.length > 0 ? { ...rest, notes } : rest;
};

/** A node's notes. */
export class SetWorkflowActionNotes {
	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string, notes: string): IWorkflowRuntime {
		if (workflow.start.id === actionId) {
			return { ...workflow, start: withNotes(workflow.start, notes) };
		}

		const componentIdx = workflow.components.findIndex(c => c.id === componentId);
		if (componentIdx === -1) return workflow;

		const component = workflow.components[componentIdx]!;
		const components = [...workflow.components];
		components[componentIdx] = {
			...component,
			actions: component.actions.map(action => action.id === actionId ? withNotes(action, notes) : action),
		};
		return { ...workflow, components };
	}
}
