import zod from "zod";

/** GET /accounts — the signed-in user. */
export const AccountOutSchema = zod.object({
	id: zod.string(),
	username: zod.string(),
	email: zod.string(),
});

/** DELETE /accounts — the account is gone. */
export const DeleteAccountOutSchema = zod.object({
	status: zod.literal("deleted"),
});

/** GET /accounts — the signed-in user. */
export type AccountOut = zod.infer<typeof AccountOutSchema>;
/** DELETE /accounts — the account is gone. */
export type DeleteAccountOut = zod.infer<typeof DeleteAccountOutSchema>;
