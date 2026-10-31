import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import { SetConfigurationOutputBinding } from "../configurations/SetConfigurationOutputBinding.js";

/** Binds one of an action's configs to an earlier action's output, by name. */
export class BindActionConfigurationOutput {
	private setBinding = new SetConfigurationOutputBinding();

	execute(action: IActionRuntime, configId: string, sourceActionId: string, outputName: string): IActionRuntime {
		return {
			...action,
			configurations: action.configurations.map(c =>
				c.id === configId ? this.setBinding.execute(c, sourceActionId, outputName) : c,
			),
		};
	}
}
