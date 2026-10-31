import { BaseError } from "../BaseError";

/** No username was given. */
export class RequiredUsername extends BaseError {

	constructor() {
		super(400, "required_username");
	}

}

/** The username doesn't meet the rules: 3 to 30 letters, digits and spaces. */
export class InvalidUsername extends BaseError {

	constructor() {
		super(400, "invalid_username")
	}

}
