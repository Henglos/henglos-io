import { BaseError } from "../BaseError";

/** No password was given. */
export class RequiredPassword extends BaseError {

	constructor() {
		super(400, "required_password");
	}

}

/** The password doesn't meet the rules: 8 to 35 characters, a capital letter, a digit, no spaces. */
export class InvalidPassword extends BaseError {

	constructor() {
		super(400, "invalid_password");
	}

}
