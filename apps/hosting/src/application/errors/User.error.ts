import { BaseError } from "./BaseError";

/** No such user. */
export class UserNotFound extends BaseError {

	constructor() {
		super(404, "user_not_found");
	}

}
