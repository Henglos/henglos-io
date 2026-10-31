import zod from "zod";
import { ComponentSchema } from "./IComponent.schema.js";
import { ConfigurationRuntime } from "./IConfiguration.runtime.js";
import { ActionRuntime } from "./IAction.runtime.js";
import { LOGIC_PACKAGE_ID, LogicComponentSchema } from "../value-objects/LogicComponent.js";
import { VARIABLES_PACKAGE_ID, VariablesComponentSchema } from "../value-objects/VariablesComponent.js";

/**
 * The built-ins (Logic, Variables) have no package version to pin — they're
 * whatever this code says. A workflow saved earlier read with today's schema,
 * so a new built-in action (Variables / Append…) shows up in it too.
 */
const withCurrentBuiltInSchema = (raw: unknown): unknown => {
	if (!raw || typeof raw !== "object" || !("packageId" in raw)) return raw;
	const { packageId } = raw as { packageId: unknown };
	if (packageId === LOGIC_PACKAGE_ID) return { ...raw, base: LogicComponentSchema };
	if (packageId === VARIABLES_PACKAGE_ID) return { ...raw, base: VariablesComponentSchema };
	return raw;
};

/** A component of the workflow: its package's schema, and the nodes of its actions. */
export const ComponentRuntime = zod.preprocess(withCurrentBuiltInSchema, zod.object({
	id: zod.string(),
	packageId: zod.string(),
	alias: zod.string(),
	base: ComponentSchema,
	actions: zod.array(ActionRuntime),
}));

/** A component of the workflow: its package's schema, and the nodes of its actions. */
export type IComponentRuntime = zod.infer<typeof ComponentRuntime>;
