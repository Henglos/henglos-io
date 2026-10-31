import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import { RemoveActionFromComponent } from "../component/RemoveAction.use-case.js";

/** Removes a node — and its wires. */
export class RemoveActionFromWorkflowComponent {
	private removeAction = new RemoveActionFromComponent();

	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string): { workflow: IWorkflowRuntime; action: IActionRuntime | undefined } {
		const componentIdx = workflow.components.findIndex(c => c.id === componentId);
		if (componentIdx === -1) return { workflow, action: undefined };
		const { component, action } = this.removeAction.execute(workflow.components[componentIdx]!, actionId);
		const components = [...workflow.components];
		components[componentIdx] = component;
		const handleIds = new Set([
			...(action?.inputs.map(i => i.id) ?? []),
			...(action?.outputs.map(o => o.id) ?? []),
		]);

		return {
			workflow: {
				...workflow,
				components,
				connections: workflow.connections.filter(
					c => !handleIds.has(c.sourceHandle) && !handleIds.has(c.targetHandle),
				),
			},
			action,
		};
	}
}
