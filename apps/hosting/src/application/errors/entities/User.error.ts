import { BaseError } from "../BaseError";

/** A user was created from nothing. */
export class RequiredUser extends BaseError {

	constructor() {
		super(400, "required_user");
	}

}
