import zod from "zod";

/** An input or output handle, as a manifest declares it. */
export const HandlerSchema = zod.object({
	id: zod.string(),
	name: zod.string(),
});

/** An input or output handle, as a manifest declares it. */
export type IHandlerSchema = zod.infer<typeof HandlerSchema>;
