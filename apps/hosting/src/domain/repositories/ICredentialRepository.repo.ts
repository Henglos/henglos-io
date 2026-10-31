import type { Credential } from "../entities/Credential";

/** Users' credentials. `data` is stored as given — encrypted by the caller. */
export interface ICredentialRepository {
	create(credential: Pick<Credential, "userId" | "type" | "name" | "data">): Promise<Credential>;
	/** Renames it, or replaces its data. Its type never changes. */
	update(id: string, changes: Partial<Pick<Credential, "name" | "data">>): Promise<Credential>;
	findById(id: string): Promise<Credential | null>;
	findByUser(userId: string): Promise<Credential[]>;
	delete(id: string): Promise<void>;
}
