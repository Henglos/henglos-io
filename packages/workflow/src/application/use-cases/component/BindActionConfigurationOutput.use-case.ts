import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";
import { BindActionConfigurationOutput } from "../actions/BindActionConfigurationOutput.js";

/** Binds a config of one of a component's nodes to an earlier action's output. */
export class BindComponentActionConfigurationOutput {
	private bindAction = new BindActionConfigurationOutput();

	execute(component: IComponentRuntime, actionId: string, configId: string, sourceActionId: string, outputName: string): IComponentRuntime {
		const idx = component.actions.findIndex(a => a.id === actionId);
		if (idx === -1) return component;
		const actions = [...component.actions];
		actions[idx] = this.bindAction.execute(actions[idx]!, configId, sourceActionId, outputName);
		return { ...component, actions };
	}
}
