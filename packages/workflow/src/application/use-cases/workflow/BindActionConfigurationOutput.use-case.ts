import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { BindComponentActionConfigurationOutput } from "../component/BindActionConfigurationOutput.use-case.js";
import { BindActionConfigurationOutput } from "../actions/BindActionConfigurationOutput.js";
import { contextSourcesOf } from "./PassContext.use-case.js";

/** Binds a node's config to an earlier node's output. */
export class BindWorkflowActionConfigurationOutput {
	private bindComponentAction = new BindComponentActionConfigurationOutput();
	private bindStartAction = new BindActionConfigurationOutput();

	// Binding only makes sense downstream of the value it reads — the source's
	// data must reach the target (right before it, or further back through
	// actions passing their context on: contextSourcesOf), otherwise the
	// source may not have run (or even exist) yet when target executes.
	execute(
		workflow: IWorkflowRuntime,
		componentId: string,
		actionId: string,
		configId: string,
		sourceActionId: string,
		outputName: string,
	): IWorkflowRuntime {
		if (!contextSourcesOf(workflow, actionId).has(sourceActionId)) return workflow;

		if (workflow.start.id === actionId) {
			return { ...workflow, start: this.bindStartAction.execute(workflow.start, configId, sourceActionId, outputName) };
		}

		const componentIdx = workflow.components.findIndex(c => c.id === componentId);
		if (componentIdx === -1) return workflow;
		const components = [...workflow.components];
		components[componentIdx] = this.bindComponentAction.execute(components[componentIdx]!, actionId, configId, sourceActionId, outputName);
		return { ...workflow, components };
	}
}
