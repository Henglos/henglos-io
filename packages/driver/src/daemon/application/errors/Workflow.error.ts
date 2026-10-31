import { BaseError } from "./Base.error.js";

/** The driver has no such workflow — it hasn't been synced here. */
export class WorkflowNotFound extends BaseError {
	constructor() {
		super("workflow_not_found", "Workflow not found.");
	}
}

/** Flashing a workflow that was never compiled on this driver. */
export class WorkflowNotCompiled extends BaseError {
	constructor() {
		super("workflow_not_compiled", "Workflow has not been compiled yet. Compile it before flashing.");
	}
}
