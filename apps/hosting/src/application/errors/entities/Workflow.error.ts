import { BaseError } from "../BaseError";

/** A workflow was created from nothing. */
export class RequiredWorkflow extends BaseError {

	constructor() {
		super(400, "required_workflow");
	}

}
