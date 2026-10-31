import zod from "zod";
import { ComponentSchemaObject } from "./IComponent.schema.js";

/** A built-in component (Logic, Variables) — whether it can be removed from a workflow. */
export const CoreComponentSchema = ComponentSchemaObject.extend({
	metadata: zod.object({
		deletable: zod.boolean().optional(),
	}).optional(),
});
