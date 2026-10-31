import zod from "zod";
import { HandlerSchema } from "./IHandler.schema.js";

/** A node's input or output handle. */
export const HandlerRuntime = zod.object({
	id: zod.string(),
	base: HandlerSchema,
});

/** A node's input or output handle. */
export type IHandlerRuntime = zod.infer<typeof HandlerRuntime>;
