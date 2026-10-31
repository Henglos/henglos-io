import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import { SetConfigurationCode } from "../configurations/SetConfigurationCode.js";

/** Computes one of an action's configs with a Code script. */
export class SetActionConfigurationCode {
	private setCode = new SetConfigurationCode();

	execute(action: IActionRuntime, configId: string, code: string): IActionRuntime {
		return {
			...action,
			configurations: action.configurations.map(c =>
				c.id === configId ? this.setCode.execute(c, code) : c,
			),
		};
	}
}
