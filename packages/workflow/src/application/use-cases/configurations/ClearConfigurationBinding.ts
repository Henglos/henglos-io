import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";

/** A config without its binding — back to its own value. */
export class ClearConfigurationBinding {
	execute(state: IConfigurationRuntime): IConfigurationRuntime {
		return { ...state, binding: null };
	}
}
