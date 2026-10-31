import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";

/** A config set to a value. */
export class UpdateConfigurationValue {
	execute(state: IConfigurationRuntime, value: IConfigurationRuntime["value"]): IConfigurationRuntime {
		return { ...state, value, binding: null };
	}
}
