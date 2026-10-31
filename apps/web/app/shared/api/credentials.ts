import type { CreateCredentialIn, CredentialOut, CredentialTypeOut, UpdateCredentialIn } from "@henglosio/shared";
import { http } from "@shared/lib/http";

/** The kinds of credential there are — what the installed components declare. */
export const listCredentialTypes = async (): Promise<CredentialTypeOut[]> =>
	(await http.get<{ types: CredentialTypeOut[] }>("/credentials/types")).data.types;

/** The user's credentials — a secret field comes back null (see `secretsSet`). */
export const listCredentials = async (): Promise<CredentialOut[]> =>
	(await http.get<{ credentials: CredentialOut[] }>("/credentials")).data.credentials;

export const createCredential = async (input: CreateCredentialIn): Promise<CredentialOut> =>
	(await http.post<CredentialOut>("/credentials", input)).data;

/** A secret field left out of `fields` keeps its value. */
export const updateCredential = async (id: string, input: UpdateCredentialIn): Promise<CredentialOut> =>
	(await http.patch<CredentialOut>(`/credentials/${id}`, input)).data;

export const deleteCredential = async (id: string): Promise<void> => {
	await http.delete(`/credentials/${id}`);
};
