import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";

// Enabled actions don't carry the field at all — same as notes.
const withDisabled = (action: IActionRuntime, disabled: boolean): IActionRuntime => {
	const { disabled: _previous, ...rest } = action;
	return disabled ? { ...rest, disabled: true } : rest;
};

/** Switches an action off (skipped when the flow runs) or back on. Start can't be switched off. */
export class SetWorkflowActionDisabled {
	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string, disabled: boolean): IWorkflowRuntime {
		if (workflow.start.id === actionId) return workflow;

		const componentIdx = workflow.components.findIndex(c => c.id === componentId);
		if (componentIdx === -1) return workflow;

		const component = workflow.components[componentIdx]!;
		const components = [...workflow.components];
		components[componentIdx] = {
			...component,
			actions: component.actions.map(action => action.id === actionId ? withDisabled(action, disabled) : action),
		};
		return { ...workflow, components };
	}
}
