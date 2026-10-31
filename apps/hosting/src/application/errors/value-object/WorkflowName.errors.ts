import { BaseError } from "../BaseError";

/** The workflow's name isn't valid. */
export class InvalidWorkflowName extends BaseError {

	constructor() {
		super(400, "invalid_workflow_name");
	}

}
