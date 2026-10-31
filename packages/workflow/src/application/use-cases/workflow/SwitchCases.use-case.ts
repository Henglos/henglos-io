import { v4 } from "uuid";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IConfigurationSchema } from "../../../domain/entities/IConfiguration.schema.js";
import { isLogicComponent } from "../../../domain/value-objects/LogicComponent.js";
import { CreateConfiguration } from "../configurations/CreateConfiguration.js";

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

const caseNumber = (displayName: string): number | undefined => {
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

const caseConfig = (n: number): IConfigurationSchema => ({
	displayName: `Case ${n}`,
	description: `Out Case ${n} when Value matches this. Empty: never.`,
	type: "string",
});

const OTHERWISE = "otherwise";

// The Switch `actionId` of the Logic component, changed by `change` — the workflow as it was otherwise.
const withSwitch = (workflow: IWorkflowRuntime, componentId: string, actionId: string, change: (action: IActionRuntime) => IActionRuntime | null): IWorkflowRuntime => {
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

/** Adds Case N+1 — its config, and its output before Default. */
export class AddSwitchCase {
	private createConfiguration = new CreateConfiguration();

	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string): IWorkflowRuntime {
		return withSwitch(workflow, componentId, actionId, action => {
			const n = switchCaseCount(action) + 1;
			if (n > MAX_SWITCH_CASES) return null;

			const config = caseConfig(n);
			const output = { id: `case_${n}`, name: `Case ${n}` };
			const baseOutputs = action.base.outputs ?? [];
			const at = baseOutputs.findIndex(handle => handle.id === OTHERWISE);
			const runtimeAt = action.outputs.findIndex(handle => handle.base.id === OTHERWISE);
			const insert = <T>(list: T[], index: number, item: T) => index === -1 ? [...list, item] : [...list.slice(0, index), item, ...list.slice(index)];

			return {
				...action,
				base: {
					...action.base,
					configurations: [...(action.base.configurations ?? []), config],
					outputs: insert(baseOutputs, at, output),
				},
				configurations: [...action.configurations, this.createConfiguration.execute(config)],
				outputs: insert(action.outputs, runtimeAt, { id: v4(), base: output }),
			};
		});
	}
}

/**
 * Removes Case `which` (the last one when not given) — its config, its output
 * and the wires leaving it — and moves the ones after it up a number: Case 4
 * is Case 3 now, with its value, its bind and its wires (they point at the
 * output's own id, which stays). A Switch keeps one case at least.
 */
export class RemoveSwitchCase {
	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string, which?: number): IWorkflowRuntime {
		let removedHandle: string | undefined;
		const updated = withSwitch(workflow, componentId, actionId, action => {
			const count = switchCaseCount(action);
			const n = which ?? count;
			if (count <= 1 || n < 1 || n > count) return null;

			removedHandle = action.outputs.find(handle => handle.base.id === `case_${n}`)?.id;

			// Case k, past the removed one, as Case k - 1.
			const shiftConfig = <T extends IConfigurationSchema>(config: T): T => {
				const k = caseNumber(config.displayName);
				return k !== undefined && k > n ? { ...config, displayName: `Case ${k - 1}`, description: caseConfig(k - 1).description } : config;
			};
			const shiftOutput = (handle: { id: string; name: string }) => {
				const k = /^case_(\d+)$/.exec(handle.id);
				const number = k ? Number(k[1]) : undefined;
				return number !== undefined && number > n ? { ...handle, id: `case_${number - 1}`, name: `Case ${number - 1}` } : handle;
			};

			return {
				...action,
				base: {
					...action.base,
					configurations: (action.base.configurations ?? []).filter(config => config.displayName !== `Case ${n}`).map(shiftConfig),
					outputs: (action.base.outputs ?? []).filter(handle => handle.id !== `case_${n}`).map(shiftOutput),
				},
				configurations: action.configurations
					.filter(config => config.base.displayName !== `Case ${n}`)
					.map(config => ({ ...config, base: shiftConfig(config.base) })),
				outputs: action.outputs
					.filter(handle => handle.base.id !== `case_${n}`)
					.map(handle => ({ ...handle, base: shiftOutput(handle.base) })),
			};
		});
		if (updated === workflow || !removedHandle) return updated;
		return { ...updated, connections: updated.connections.filter(c => !(c.source === actionId && c.sourceHandle === removedHandle)) };
	}
}
