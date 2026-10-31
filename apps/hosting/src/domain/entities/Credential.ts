/** A user's credential — `data` its fields, encrypted (see SecretBox). */
export type Credential = {
	id: string;
	userId: string;
	/** Its credential type's name — declared by a component's manifest. */
	type: string;
	name: string;
	data: string;
	createdAt: Date;
	updatedAt: Date;
};
