import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";

/** A config bound to another action's config. */
export class SetConfigurationBinding {
	execute(state: IConfigurationRuntime, actionId: string, configurationName: string): IConfigurationRuntime {
		if (!state.base.bind?.schemas) return state;
		return { ...state, binding: { actionId, configurationName } };
	}
}
