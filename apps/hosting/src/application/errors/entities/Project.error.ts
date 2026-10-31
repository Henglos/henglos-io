import { BaseError } from "../BaseError";

/** A project was created from nothing. */
export class RequiredProject extends BaseError {

	constructor() {
		super(400, "required_project");
	}

}
