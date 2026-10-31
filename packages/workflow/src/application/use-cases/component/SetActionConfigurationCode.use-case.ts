import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";
import { SetActionConfigurationCode } from "../actions/SetActionConfigurationCode.js";

/** Computes a config of one of a component's nodes with a Code script. */
export class SetComponentActionConfigurationCode {
	private setCode = new SetActionConfigurationCode();

	execute(component: IComponentRuntime, actionId: string, configId: string, code: string): IComponentRuntime {
		const idx = component.actions.findIndex(a => a.id === actionId);
		if (idx === -1) return component;
		const actions = [...component.actions];
		actions[idx] = this.setCode.execute(actions[idx]!, configId, code);
		return { ...component, actions };
	}
}
