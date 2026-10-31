import zod from "zod";

/** A long operation's task id — its progress comes over the app socket (task:subscribe). */
export const LogIdOutSchema = zod.object({
	id: zod.string()
})

/** A long operation's task id — its progress comes over the app socket (task:subscribe). */
export type LogsIdOut = zod.infer<typeof LogIdOutSchema>;
