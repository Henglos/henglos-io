import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";
import { UpdateConfigurationValue } from "../configurations/UpdateConfigurationValue.js";

/** Sets one of an action's configs to a value. */
export class UpdateActionConfiguration {
	private updateValue = new UpdateConfigurationValue();

	execute(action: IActionRuntime, configId: string, value: IConfigurationRuntime["value"]): IActionRuntime {
		return {
			...action,
			configurations: action.configurations.map(c =>
				c.id === configId ? this.updateValue.execute(c, value) : c,
			),
		};
	}
}
