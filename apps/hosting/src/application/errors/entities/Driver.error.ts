import { BaseError } from "../BaseError";

/** A driver was created from nothing. */
export class RequiredDriver extends BaseError {

	constructor() {
		super(400, "required_driver");
	}

}
