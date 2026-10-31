import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";
import { CreateComponent } from "../component/CreateComponent.use-case.js";

/** Adds a component package to the workflow — its actions become available as nodes. */
export class AddComponentToWorkflow {
	private createComponent = new CreateComponent();

	execute(workflow: IWorkflowRuntime, component: IComponentSchema, packageId: string): { workflow: IWorkflowRuntime; component: IComponentRuntime } {
		const samePackageCount = workflow.components.filter(c => c.packageId === packageId).length;
		const baseName = component.displayName ?? "Component";
		const autoAlias = samePackageCount === 0
			? baseName
			: `${baseName} ${samePackageCount + 1}`;

		const instance = this.createComponent.execute(component, packageId, autoAlias);
		return {
			workflow: { ...workflow, components: [...workflow.components, instance] },
			component: instance,
		};
	}
}
