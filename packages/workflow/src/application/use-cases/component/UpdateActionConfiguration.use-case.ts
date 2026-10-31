import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";
import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";
import { UpdateActionConfiguration } from "../actions/UpdateActionConfiguration.js";

/** Sets a config of one of a component's nodes to a value. */
export class UpdateComponentActionConfiguration {
	private updateAction = new UpdateActionConfiguration();

	execute(component: IComponentRuntime, actionId: string, configId: string, value: IConfigurationRuntime["value"]): IComponentRuntime {
		const idx = component.actions.findIndex(a => a.id === actionId);
		if (idx === -1) return component;
		const actions = [...component.actions];
		actions[idx] = this.updateAction.execute(actions[idx]!, configId, value);
		return { ...component, actions };
	}
}
