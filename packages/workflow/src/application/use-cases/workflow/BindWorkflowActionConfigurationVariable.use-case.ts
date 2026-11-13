import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";

/** Applies `update` to one action — Start or a component's — wherever it lives. */
const mapAction = (workflow: IWorkflowRuntime, componentId: string, actionId: string, update: (action: IActionRuntime) => IActionRuntime): IWorkflowRuntime => {
	if (workflow.start.id === actionId) return { ...workflow, start: update(workflow.start) };

	const index = workflow.components.findIndex(component => component.id === componentId);
	if (index === -1) return workflow;

	const component = workflow.components[index]!;
	const components = [...workflow.components];
	components[index] = { ...component, actions: component.actions.map(action => action.id === actionId ? update(action) : action) };
	return { ...workflow, components };
};

/** Binds a node's config to a workflow variable. */
export class BindWorkflowActionConfigurationVariable {
	// No connectivity check, unlike an output binding: a variable is global,
	// written by whatever Set ran last — before this action in the flow or in
	// an earlier loop.
	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string, configId: string, variableId: string): IWorkflowRuntime {
		if (!(workflow.variables ?? []).some(variable => variable.id === variableId)) return workflow;
		return mapAction(workflow, componentId, actionId, action => ({
			...action,
			configurations: action.configurations.map(config => config.id === configId ? { ...config, binding: { variableId } } : config),
		}));
	}
}
