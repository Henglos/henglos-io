import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";

/** Whether `action` is a trigger's node — starts a branch on its own (a component's `triggers`, see TriggerSchema). */
export const isTriggerAction = (action: Pick<IActionRuntime, "kind">): boolean => action.kind === "trigger";

/** The workflow's triggers, in component order — a disabled one included (see withoutDisabledActions). */
export function workflowTriggers(workflow: IWorkflowRuntime): IActionRuntime[] {
	return workflow.components.flatMap(component => component.actions.filter(isTriggerAction));
}

/**
 * Ids of every node a branch starts from: Start, then each trigger. Run on
 * withoutDisabledActions(workflow) to leave the disabled triggers out.
 */
export function workflowEntries(workflow: IWorkflowRuntime): string[] {
	return [workflow.start.id, ...workflowTriggers(workflow).map(action => action.id)];
}

/** Whether `actionId` is Start or a trigger — nothing may be wired into it. */
export function isEntryAction(workflow: IWorkflowRuntime, actionId: string): boolean {
	return workflowEntries(workflow).includes(actionId);
}
