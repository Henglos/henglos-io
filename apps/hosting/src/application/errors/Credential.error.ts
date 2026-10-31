import { BaseError } from "./BaseError";

/** No such credential — or it isn't the user's. */
export class CredentialNotFound extends BaseError {

	constructor() {
		super(404, "credential_not_found")
	}

}

/** No installed package declares a credential type by that name. */
export class CredentialTypeNotFound extends BaseError {

	constructor(type: string) {
		super(404, "credential_type_not_found", type)
	}

}

/** Fields that don't fit the credential's type — `info` says which and why. */
export class InvalidCredential extends BaseError {

	constructor(reason: string) {
		super(400, "invalid_credential", reason)
	}

}

/** A workflow picks a credential the user doesn't have (deleted, or another account's). */
export class CredentialMissing extends BaseError {

	constructor(reason: string) {
		super(400, "credential_missing", reason)
	}

}
