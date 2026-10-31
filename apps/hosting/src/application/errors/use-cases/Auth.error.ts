import { BaseError } from "../BaseError";

/** Another account uses that email. */
export class EmailAlreadyExists extends BaseError {

	constructor() {
		super(400, "email_already_exists");
	}

}

/** Another account uses that username. */
export class UsernameAlreadyExists extends BaseError {

	constructor() {
		super(400, "username_already_exists");
	}

}

/** The email and password don't match an account. */
export class WrongAuthCredentials extends BaseError {

	constructor() {
		super(400, "wrong_auth_credentials");
	}

}

/** A token that isn't valid — malformed, badly signed, or revoked. */
export class InvalidToken extends BaseError {

	constructor() {
		super(400, "invalid_token");
	}

}

/** A token that was valid, but has expired — refresh it. */
export class ExpiredToken extends BaseError {

	constructor() {
		super(401, "expired_token");
	}

}

/** No sign-in strategy by that name. */
export class InvalidAuthStrategy extends BaseError {

	constructor() {
		super(400, "invalid_auth_strategy");
	}

}

/**
 * Signing up when the installation already has its user — the first account
 * is created once, from the setup page.
 */
export class UserAlreadyReigstered extends BaseError {

	constructor() {
		super(400, "user_alredy_registerd");
	}

}
