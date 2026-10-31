import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";

/** Removes one of a component's nodes. */
export class RemoveActionFromComponent {
	execute(component: IComponentRuntime, actionId: string): { component: IComponentRuntime; action: IActionRuntime | undefined } {
		const action = component.actions.find(a => a.id === actionId);
		return {
			component: { ...component, actions: component.actions.filter(a => a.id !== actionId) },
			action,
		};
	}
}
