import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IConfigurationSchema } from "../../../domain/entities/IConfiguration.schema.js";
import { isLogicComponent } from "../../../domain/value-objects/LogicComponent.js";

// Switch's cases: as many as the flow needs — each a "Case N" config (what
// Value is matched against) and a "case_N" output it goes out on. Added at
// the end and removed from the end, so a case keeps its number (and its wire
// ids, generateId("switch/case N") / generateId("case_N")) for as long as it's
// there. Kept in the node's own schema (action.base): another Switch has its own.

/**
 * At most this many: Value, Match and Pass Context's flag take three of a
 * board's 15 configs per command (MAX_CONFIGS_PER_COMMAND) — and only so
 * many outputs can be wired (MAX_OUTPUTS_PER_ACTION, a platform setting).
 */
export const MAX_SWITCH_CASES = 12;

export const caseNumber = (displayName: string): number | undefined => {
	const match = /^Case (\d+)$/.exec(displayName);
	return match ? Number(match[1]) : undefined;
};

/** How many cases a Switch node has — 0 for any other action. */
export function switchCaseCount(action: Pick<IActionRuntime, "base">): number {
	return (action.base.configurations ?? []).filter(config => caseNumber(config.displayName) !== undefined).length;
}

/** Whether `action` is Logic's Switch. */
export function isSwitchAction(workflow: IWorkflowRuntime, actionId: string): boolean {
	const component = workflow.components.find(found => found.actions.some(action => action.id === actionId));
	return !!component && isLogicComponent(component)
		&& component.actions.find(action => action.id === actionId)!.base.displayName === "Switch";
}

export const caseConfig = (n: number): IConfigurationSchema => ({
	displayName: `Case ${n}`,
	description: `Out Case ${n} when Value matches this. Empty: never.`,
	type: "string",
});

export const OTHERWISE = "otherwise";

// The Switch `actionId` of the Logic component, changed by `change` — the workflow as it was otherwise.
export const withSwitch = (workflow: IWorkflowRuntime, componentId: string, actionId: string, change: (action: IActionRuntime) => IActionRuntime | null): IWorkflowRuntime => {
	if (!isSwitchAction(workflow, actionId)) return workflow;
	const componentIdx = workflow.components.findIndex(c => c.id === componentId);
	if (componentIdx === -1) return workflow;
	const component = workflow.components[componentIdx]!;
	const action = component.actions.find(found => found.id === actionId)!;
	const changed = change(action);
	if (!changed) return workflow;
	const components = [...workflow.components];
	components[componentIdx] = { ...component, actions: component.actions.map(found => found.id === actionId ? changed : found) };
	return { ...workflow, components };
};
