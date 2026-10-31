import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";

/** A config bound to an earlier action's output. */
export class SetConfigurationOutputBinding {
	execute(state: IConfigurationRuntime, actionId: string, outputName: string): IConfigurationRuntime {
		return { ...state, binding: { actionId, outputName } };
	}
}
