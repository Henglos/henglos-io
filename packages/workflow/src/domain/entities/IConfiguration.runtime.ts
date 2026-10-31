
import zod from "zod";
import { BindingSchema, OutputBindingSchema, CodeBindingSchema, VariableBindingSchema, ConfigurationSchema, ConfigurationValueSchema } from "./IConfiguration.schema.js";

/**
 * A node's config: its schema, its value — or what it's bound to (another config, an output,
 * a script or a variable).
 */
export const ConfigurationRuntime = zod.object({
	id: zod.string(),
	base: ConfigurationSchema,
	binding: zod.union([BindingSchema, OutputBindingSchema, CodeBindingSchema, VariableBindingSchema]).nullable(),
	value: ConfigurationValueSchema,
});

/**
 * A node's config: its schema, its value — or what it's bound to (another config, an output,
 * a script or a variable).
 */
export type IConfigurationRuntime = zod.infer<typeof ConfigurationRuntime>;
