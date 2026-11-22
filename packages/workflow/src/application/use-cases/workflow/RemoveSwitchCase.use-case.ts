import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IConfigurationSchema } from "../../../domain/entities/IConfiguration.schema.js";
import { caseNumber, renumberCaseConfig, switchCaseCount, withSwitch } from "./SwitchCases.js";

/**
 * Removes Case `which` (the last one when not given) — its configs, its
 * output and the wires leaving it — and moves the ones after it up a number:
 * Case 4 is Case 3 now, with its values, its binds and its wires (they point
 * at the output's own id, which stays). A Switch keeps one case at least.
 */
export class RemoveSwitchCase {
	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string, which?: number): IWorkflowRuntime {
		let removedHandle: string | undefined;
		const updated = withSwitch(workflow, componentId, actionId, action => {
			const count = switchCaseCount(action);
			const n = which ?? count;
			if (count <= 1 || n < 1 || n > count) return null;

			removedHandle = action.outputs.find(handle => handle.base.id === `case_${n}`)?.id;

			const removed = (config: IConfigurationSchema) => caseNumber(config.displayName) === n;
			// A config of Case k, past the removed one, as Case k - 1's.
			const shiftConfig = <T extends IConfigurationSchema>(config: T): T => {
				const k = caseNumber(config.displayName);
				return k !== undefined && k > n ? renumberCaseConfig(config, k - 1) : config;
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
					configurations: (action.base.configurations ?? []).filter(config => !removed(config)).map(shiftConfig),
					outputs: (action.base.outputs ?? []).filter(handle => handle.id !== `case_${n}`).map(shiftOutput),
				},
				configurations: action.configurations
					.filter(config => !removed(config.base))
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
