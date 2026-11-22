import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IConfigurationSchema } from "../../../domain/entities/IConfiguration.schema.js";
import { isLogicComponent, switchCaseConfigs } from "../../../domain/value-objects/LogicComponent.js";

// Switch's cases: as many as the flow needs — each its own condition (n8n
// style): "Case N value", "Case N operation" and "Case N compare to" configs,
// and a "case_N" output it goes out on. Added at the end and removed from the
// end, so a case keeps its number (and its wire ids, generateId("switch/case N
// value") … / generateId("case_N")) for as long as it's there. Kept in the
// node's own schema (action.base): another Switch has its own.

/**
 * At most this many — only so many outputs can be wired
 * (MAX_OUTPUTS_PER_ACTION) and each case takes up to three of a board's
 * configs per command (MAX_CONFIGS_PER_COMMAND), both platform settings.
 */
export const MAX_SWITCH_CASES = 12;

/** Configs a case sends at most: value, operation and compare to. */
export const CONFIGS_PER_SWITCH_CASE = 3;

/** The case a config belongs to ("Case 2 operation" → 2), undefined for any other. */
export const caseNumber = (displayName: string): number | undefined => {
	const match = /^Case (\d+) (value|operation|compare to)$/.exec(displayName);
	return match ? Number(match[1]) : undefined;
};

/** How many cases a Switch node has — 0 for any other action. */
export function switchCaseCount(action: Pick<IActionRuntime, "base">): number {
	return (action.base.configurations ?? []).filter(config => /^Case \d+ value$/.test(config.displayName)).length;
}

/** Whether `action` is Logic's Switch. */
export function isSwitchAction(workflow: IWorkflowRuntime, actionId: string): boolean {
	const component = workflow.components.find(found => found.actions.some(action => action.id === actionId));
	return !!component && isLogicComponent(component)
		&& component.actions.find(action => action.id === actionId)!.base.displayName === "Switch";
}

/** Case `n`'s configs — see switchCaseConfigs. */
export const caseConfigs = (n: number): IConfigurationSchema[] => switchCaseConfigs(n);

/** `config` (one of a case's) renumbered as case `n`'s — same role, its schema regenerated. */
export const renumberCaseConfig = <T extends IConfigurationSchema>(config: T, n: number): T => {
	const role = config.displayName.replace(/^Case \d+ /, "");
	return (caseConfigs(n).find(found => found.displayName === `Case ${n} ${role}`) as T | undefined) ?? config;
};

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
