import { v4 } from "uuid";
import type { IConfigurationSchema } from "../../../domain/entities/IConfiguration.schema.js";
import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";

/** A config from its schema, with its default value. */
export class CreateConfiguration {
	execute(base: IConfigurationSchema): IConfigurationRuntime {
		return { id: v4(), base, binding: null, value: base.defaultValue };
	}
}
