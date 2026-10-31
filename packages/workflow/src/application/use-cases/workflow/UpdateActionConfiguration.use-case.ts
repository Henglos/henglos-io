import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";
import { UpdateComponentActionConfiguration } from "../component/UpdateActionConfiguration.use-case.js";
import { UpdateActionConfiguration } from "../actions/UpdateActionConfiguration.js";

/** Sets a node's config to a value. */
export class UpdateWorkflowActionConfiguration {
	private updateAction = new UpdateComponentActionConfiguration();
	private updateStartAction = new UpdateActionConfiguration();

	execute(
		workflow: IWorkflowRuntime,
		componentId: string,
		actionId: string,
		configId: string,
		value: IConfigurationRuntime["value"],
	): IWorkflowRuntime {
		if (workflow.start.id === actionId) {
			return { ...workflow, start: this.updateStartAction.execute(workflow.start, configId, value) };
		}

		const componentIdx = workflow.components.findIndex(c => c.id === componentId);
		if (componentIdx === -1) return workflow;
		const components = [...workflow.components];
		components[componentIdx] = this.updateAction.execute(components[componentIdx]!, actionId, configId, value);
		return { ...workflow, components };
	}
}
