import { BaseError } from "../BaseError";

/** No email was given. */
export class RequiredEmail extends BaseError {

	constructor() {
		super(400, "required_email");
	}

}

/** What was given isn't an email address. */
export class InvalidEmail extends BaseError {

	constructor() {
		super(400, "invalid_email");
	}

}
