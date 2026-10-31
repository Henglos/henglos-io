import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";
import { SetConfigurationBinding } from "../configurations/SetConfigurationBinding.js";

/** Binds a config of one of a component's nodes to another action's. */
export class BindActionConfiguration {
	private setBinding = new SetConfigurationBinding();

	execute(
		component: IComponentRuntime,
		actionId: string,
		configName: string,
		sourceActionId: string,
		sourceConfigName: string,
	): IComponentRuntime {
		const actionIdx = component.actions.findIndex(a => a.id === actionId);
		if (actionIdx === -1) return component;
		const action = component.actions[actionIdx]!;
		const configIdx = action.configurations.findIndex(c => c.base.displayName === configName);
		if (configIdx === -1) return component;
		const configurations = [...action.configurations];
		configurations[configIdx] = this.setBinding.execute(configurations[configIdx]!, sourceActionId, sourceConfigName);
		const actions = [...component.actions];
		actions[actionIdx] = { ...action, configurations };
		return { ...component, actions };
	}
}
