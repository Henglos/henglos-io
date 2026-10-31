import zod from "zod";

// A kind of credential a component needs — declared in its manifest
// (`schema.credentials`), filled in once by the user in the studio's
// Credentials page, kept by the hosting (secret fields encrypted), and picked
// by name in an action's `type: credential` config. Like n8n's credentials:
// the workflow holds a reference, never the values.
//
// `name` is global — a component may use a type another package declares
// (a GPT and a Whisper component both on "openai"): keep it specific
// ("wifi", "openai", "telegram_bot").

export const CredentialFieldSchema = zod.object({
	name: zod.string().regex(/^[a-z][a-z0-9_]*$/, "a field name: lowercase letters, digits and _"),
	displayName: zod.string().min(1),
	description: zod.string().optional(),
	type: zod.enum(["string", "number"]).default("string"),
	// Encrypted by the hosting, never shown again once saved — a password, a token.
	secret: zod.boolean().optional(),
	required: zod.boolean().optional(),
	placeholder: zod.string().optional(),
}).strict();

/** A kind of credential a component's manifest declares (`credentials:`): its name and fields. */
export const CredentialTypeSchema = zod.object({
	name: zod.string().regex(/^[a-z][a-z0-9_]*$/, "a credential type name: lowercase letters, digits and _"),
	displayName: zod.string().min(1),
	description: zod.string().optional(),
	fields: zod.array(CredentialFieldSchema).min(1),
}).strict();

/** A kind of credential a component's manifest declares (`credentials:`): its name and fields. */
export type ICredentialTypeSchema = zod.infer<typeof CredentialTypeSchema>;
