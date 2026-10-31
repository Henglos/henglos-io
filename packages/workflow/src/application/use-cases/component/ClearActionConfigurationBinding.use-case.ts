import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";
import { ClearConfigurationBinding } from "../configurations/ClearConfigurationBinding.js";

/** Unbinds a config of one of a component's nodes. */
export class ClearActionConfigurationBinding {
	private clearBinding = new ClearConfigurationBinding();

	execute(component: IComponentRuntime, actionId: string, configId: string): IComponentRuntime {
		const actionIdx = component.actions.findIndex(a => a.id === actionId);
		if (actionIdx === -1) return component;
		const action = component.actions[actionIdx]!;
		const configIdx = action.configurations.findIndex(c => c.id === configId);
		if (configIdx === -1) return component;
		const configurations = [...action.configurations];
		configurations[configIdx] = this.clearBinding.execute(configurations[configIdx]!);
		const actions = [...component.actions];
		actions[actionIdx] = { ...action, configurations };
		return { ...component, actions };
	}
}
