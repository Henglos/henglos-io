import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";

/** Removes a component from the workflow — and its nodes. */
export class RemoveComponentFromWorkflow {
	execute(workflow: IWorkflowRuntime, componentId: string): { workflow: IWorkflowRuntime; component: IComponentRuntime | undefined } {
		const component = workflow.components.find(c => c.id === componentId);
		const actionIds = new Set((component?.actions ?? []).map(a => a.id));
		return {
			workflow: {
				...workflow,
				components: workflow.components.filter(c => c.id !== componentId),
				connections: workflow.connections.filter(c => !actionIds.has(c.source) && !actionIds.has(c.target)),
			},
			component,
		};
	}
}
