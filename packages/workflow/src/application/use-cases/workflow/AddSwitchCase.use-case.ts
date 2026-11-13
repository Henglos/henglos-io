import { v4 } from "uuid";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { CreateConfiguration } from "../configurations/CreateConfiguration.js";
import { caseConfig, MAX_SWITCH_CASES, OTHERWISE, switchCaseCount, withSwitch } from "./SwitchCases.js";

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
