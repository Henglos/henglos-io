import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IConfigurationSchema } from "../../../domain/entities/IConfiguration.schema.js";
import { caseNumber, renumberCaseConfig, switchCaseCount, withSwitch } from "./SwitchCases.js";

/**
 * Moves Case `from` to position `to` — the ones in between shift a number to
 * make room. Each case keeps its values, its binds and its wires (they point
 * at the output's own id, which stays); only its number changes, so the
 * board tests them in the new order.
 */
export class MoveSwitchCase {
	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string, from: number, to: number): IWorkflowRuntime {
		return withSwitch(workflow, componentId, actionId, action => {
			const count = switchCaseCount(action);
			if (from === to || from < 1 || to < 1 || from > count || to > count) return null;

			// Old number -> new one.
			const order = Array.from({ length: count }, (_, i) => i + 1);
			order.splice(to - 1, 0, ...order.splice(from - 1, 1));
			const renumber = new Map(order.map((old, i) => [old, i + 1]));

			const moveConfig = <T extends IConfigurationSchema>(config: T): T => {
				const k = caseNumber(config.displayName);
				return k === undefined ? config : renumberCaseConfig(config, renumber.get(k)!);
			};
			// Cases' configs in case order, after the action's other ones.
			const sortConfigs = <T>(list: T[], base: (item: T) => IConfigurationSchema): T[] => {
				const others = list.filter(item => caseNumber(base(item).displayName) === undefined);
				const cases = list.filter(item => caseNumber(base(item).displayName) !== undefined);
				return [...others, ...cases.sort((a, b) => caseNumber(base(a).displayName)! - caseNumber(base(b).displayName)!)];
			};

			const moveOutput = (handle: { id: string; name: string }) => {
				const k = /^case_(\d+)$/.exec(handle.id);
				const number = k ? renumber.get(Number(k[1])) : undefined;
				return number === undefined ? handle : { ...handle, id: `case_${number}`, name: `Case ${number}` };
			};
			// Case outputs in case order, where the case outputs were; the rest (Default) stays put.
			const sortOutputs = <T>(list: T[], base: (item: T) => { id: string }): T[] => {
				const number = (item: T) => { const k = /^case_(\d+)$/.exec(base(item).id); return k ? Number(k[1]) : undefined; };
				const cases = list.filter(item => number(item) !== undefined).sort((a, b) => number(a)! - number(b)!);
				let next = 0;
				return list.map(item => number(item) !== undefined ? cases[next++]! : item);
			};

			return {
				...action,
				base: {
					...action.base,
					configurations: sortConfigs((action.base.configurations ?? []).map(moveConfig), config => config),
					outputs: sortOutputs((action.base.outputs ?? []).map(moveOutput), handle => handle),
				},
				configurations: sortConfigs(action.configurations.map(config => ({ ...config, base: moveConfig(config.base) })), config => config.base),
				outputs: sortOutputs(action.outputs.map(handle => ({ ...handle, base: moveOutput(handle.base) })), handle => handle.base),
			};
		});
	}
}
