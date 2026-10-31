import { BaseError } from "./BaseError";

/** The signed-in user can't do this — the resource isn't theirs, or the action isn't allowed. */
export class OperationNotPermitted extends BaseError {

	constructor() {
		super(400, "operation_not_permitted")
	}

}
