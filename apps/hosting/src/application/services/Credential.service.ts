import { Inject, Injectable } from "@nestjs/common";
import type { IComponentSchema, ICredentialTypeSchema } from "@henglosio/workflow";
import type { CredentialOut, CredentialTypeOut } from "@henglosio/shared";

import type { Credential } from "@/domain/entities/Credential";
import type { ICredentialRepository } from "@/domain/repositories/ICredentialRepository.repo";
import type { IAccountPackageRepository } from "@/domain/repositories/IAccountPackageRepository.repo";
import { SecretBox } from "./SecretBox.service";
import { CredentialMissing, CredentialNotFound, CredentialTypeNotFound, InvalidCredential } from "@/application/errors/Credential.error";

/** A credential's fields, by name — in the clear. */
export type CredentialValues = Record<string, string | number>;

/**
 * What the credential use cases share. Credentials are n8n-style: their
 * kinds (and fields) are what the user's installed components declare
 * (`schema.credentials`); the values are kept encrypted (SecretBox), and a
 * secret field is never sent back — the studio sees that it's set, and can
 * replace it. values() is the one way out, for the board a session installs
 * them on (BuildBoardInstall).
 */
@Injectable()
export class CredentialService {

	constructor(
		@Inject("ICredentialRepository") private readonly credentialRepository: ICredentialRepository,
		@Inject("IAccountPackageRepository") private readonly accountPackageRepository: IAccountPackageRepository,
		private readonly secretBox: SecretBox,
	) {}

	/** The credential types the user's installed components declare — the first package declaring a name wins. */
	async types(userId: string): Promise<CredentialTypeOut[]> {
		const found = new Map<string, CredentialTypeOut>();
		for (const accountPackage of await this.accountPackageRepository.findAllByUser(userId, { type: "component" })) {
			const schema = accountPackage.pkg.schema as IComponentSchema;
			for (const type of schema.credentials ?? []) {
				if (!found.has(type.name)) found.set(type.name, { ...type, declaredBy: schema.displayName });
			}
		}
		return [...found.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
	}

	/** The type `name` — one of the user's installed components has to declare it. */
	async type(userId: string, name: string): Promise<ICredentialTypeSchema> {
		const type = (await this.types(userId)).find(found => found.name === name);
		if (!type) throw new CredentialTypeNotFound(name);
		return type;
	}

	/** The user's credential `id`. */
	async own(userId: string, id: string): Promise<Credential> {
		const credential = await this.credentialRepository.findById(id);
		if (!credential || credential.userId !== userId) throw new CredentialNotFound();
		return credential;
	}

	/** Whether `userId` has the credential — an import keeps only the references that are the importer's. */
	async owns(userId: string, id: string): Promise<boolean> {
		const credential = await this.credentialRepository.findById(id);
		return !!credential && credential.userId === userId;
	}

	/** All of a credential's values — only for the board a session puts them on. */
	async values(userId: string, id: string): Promise<CredentialValues> {
		const credential = await this.credentialRepository.findById(id);
		if (!credential || credential.userId !== userId) {
			throw new CredentialMissing("A credential this workflow uses is gone — pick one again in its config");
		}
		return this.read(credential);
	}

	/** Values sealed for storage. */
	seal(values: CredentialValues): string {
		return this.secretBox.seal(JSON.stringify(values));
	}

	/**
	 * A stored credential's values, decrypted.
	 *
	 * @throws InvalidCredential when it can't be decrypted with this server's key.
	 */
	read(credential: Credential): CredentialValues {
		try {
			return JSON.parse(this.secretBox.open(credential.data)) as CredentialValues;
		} catch {
			// Sealed with another key (HIO_SECRETS_KEY / HIO_JWT_SECRET changed).
			throw new InvalidCredential(`"${credential.name}" can't be read with this server's key — enter its values again`);
		}
	}

	/**
	 * `before` with `input` applied, checked against the type: only its
	 * fields, numbers as numbers, the required ones there. A secret field
	 * left out (or sent empty) keeps what it was — the studio never has it.
	 */
	validate(type: ICredentialTypeSchema, before: CredentialValues, input: CredentialValues): CredentialValues {
		for (const name of Object.keys(input)) {
			if (!type.fields.some(field => field.name === name)) throw new InvalidCredential(`"${type.displayName}" has no field "${name}"`);
		}
		const values: CredentialValues = {};
		for (const field of type.fields) {
			let value = input[field.name];
			if ((value === undefined || value === "") && (field.secret || value === undefined)) value = before[field.name];
			if (value === undefined || value === "") {
				if (field.required) throw new InvalidCredential(`${field.displayName} is required`);
				continue;
			}
			if (field.type === "number") {
				const number = typeof value === "number" ? value : Number(value);
				if (!Number.isFinite(number)) throw new InvalidCredential(`${field.displayName} has to be a number`);
				value = number;
			}
			values[field.name] = value;
		}
		return values;
	}

	/** What the studio sees of a credential: its fields, the secret ones only as set or not. */
	toOut(credential: Credential, type: ICredentialTypeSchema | undefined): CredentialOut {
		let values: CredentialValues = {};
		try {
			values = JSON.parse(this.secretBox.open(credential.data)) as CredentialValues;
		} catch {
			// Unreadable with this key: shown with nothing set.
		}
		// Without its type, which fields are secret isn't known — none is shown.
		const secret = (name: string) => !type || !!type.fields.find(field => field.name === name)?.secret;
		const names = type ? type.fields.map(field => field.name) : Object.keys(values);
		return {
			id: credential.id,
			type: credential.type,
			name: credential.name,
			fields: Object.fromEntries(names.map(name => [name, secret(name) ? null : values[name] ?? null])),
			secretsSet: names.filter(name => secret(name) && values[name] !== undefined && values[name] !== ""),
			typeMissing: !type,
			createdAt: credential.createdAt.toISOString(),
			updatedAt: credential.updatedAt.toISOString(),
		};
	}

}
