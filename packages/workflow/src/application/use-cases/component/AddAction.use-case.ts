import type { IActionSchema } from "../../../domain/entities/IAction.schema.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";
import { CreateAction } from "../actions/CreateAction.use-case.js";

/** Adds a node of one of a component's actions to it. */
export class AddActionToComponent {
	private createAction = new CreateAction();

	execute(component: IComponentRuntime, action: IActionSchema): { component: IComponentRuntime; action: IActionRuntime } {
		// One of its component's triggers: a trigger's node.
		const trigger = component.base.triggers?.some(schema => schema.displayName === action.displayName);
		const actionRuntime = this.createAction.execute(action, component.id, undefined, trigger ? "trigger" : undefined);
		return {
			component: { ...component, actions: [...component.actions, actionRuntime] },
			action: actionRuntime,
		};
	}
}
