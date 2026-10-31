import zod from "zod";

// The user's credentials (studio <-> hosting) — n8n-style: kept by the
// hosting, secret fields encrypted, picked by id in a `type: credential`
// config. The kinds there are (their fields) come from the components'
// manifests — see CredentialTypeSchema in @henglosio/workflow.

const FieldValueSchema = zod.union([zod.string().max(2048), zod.number()]);

// POST /credentials
export const CreateCredentialInSchema = zod.object({
	type: zod.string().min(1),
	name: zod.string().trim().min(1).max(100),
	fields: zod.record(zod.string(), FieldValueSchema),
});

// PATCH /credentials/:id — a secret field left out keeps what it was.
export const UpdateCredentialInSchema = zod.object({
	name: zod.string().trim().min(1).max(100).optional(),
	fields: zod.record(zod.string(), FieldValueSchema).optional(),
});

/** A credential as the studio sees it — a secret field's value never comes back. */
export type CredentialOut = {
	id: string;
	type: string;
	name: string;
	/** The fields' values — a secret one is null (never sent back), see `secretsSet`. */
	fields: Record<string, string | number | null>;
	/** The secret fields that hold a value. */
	secretsSet: string[];
	/** No installed package declares its type any more — it can't be edited (or used) until one does. */
	typeMissing: boolean;
	createdAt: string;
	updatedAt: string;
};

/** One field of a credential type, as a component's manifest declares it. */
export type CredentialTypeField = {
	name: string;
	displayName: string;
	description?: string;
	type: "string" | "number";
	secret?: boolean;
	required?: boolean;
	placeholder?: string;
};

/** A kind of credential, as the user's installed components declare it. */
export type CredentialTypeOut = {
	name: string;
	displayName: string;
	description?: string;
	fields: CredentialTypeField[];
	/** The package that declares it (its display name). */
	declaredBy: string;
};

/** POST /credentials — a new credential: its type, name and fields. */
export type CreateCredentialIn = zod.infer<typeof CreateCredentialInSchema>;
/** PATCH /credentials/:id — a new name and/or fields (a secret left out keeps what it was). */
export type UpdateCredentialIn = zod.infer<typeof UpdateCredentialInSchema>;
