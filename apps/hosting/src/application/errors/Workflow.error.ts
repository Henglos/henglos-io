import { BaseError } from "./BaseError";

/** No such workflow — or it isn't the user's. */
export class WorkflowNotFound extends BaseError {

	constructor() {
		super(400, "workflow_not_found")
	}

}

/** The user already has a workflow with that name. */
export class WorkflowNameAlreadyInUse extends BaseError {

	constructor() {
		super(400, "workflow_name_already_in_use")
	}

}

/**
 * Its board's version was removed with no other to move it to (DeletePackage):
 * nothing to build for until another board is picked.
 */
export class WorkflowWithoutBoard extends BaseError {

	constructor() {
		super(400, "workflow_without_board")
	}

}

/** The workflow has no action with that id. */
export class ActionNotFound extends BaseError {

	constructor() {
		super(404, "action_not_found")
	}

}

/**
 * The board didn't run an action the studio asked to run on its own (▶) —
 * `info` says why (not installed, timed out, an invalid answer).
 */
export class ActionRunFailed extends BaseError {

	constructor(reason: string) {
		super(502, "action_run_failed", reason)
	}

}

/**
 * A .hio that can't be imported — `info` says why (not a zip, no manifest,
 * a newer format, a workflow.json that doesn't validate).
 */
export class InvalidWorkflowArchive extends BaseError {

	constructor(reason: string) {
		super(400, "invalid_workflow_archive", reason)
	}

}

/**
 * A package a .hio needs couldn't be installed from its registry (gone,
 * private, built for another platform) — `info` names it and why.
 */
export class ImportPackageFailed extends BaseError {

	constructor(pkg: string, reason: string) {
		super(422, "import_package_failed", `${pkg}: ${reason}`)
	}

}

/** The workflow has no file with that id. */
export class WorkflowFileNotFound extends BaseError {

	constructor() {
		super(404, "workflow_file_not_found")
	}

}

/** A file that can't be attached — `info` says why (too big, empty…). */
export class InvalidWorkflowFile extends BaseError {

	constructor(reason: string) {
		super(400, "invalid_workflow_file", reason)
	}

}

/** A node needs what the board doesn't have (wifi, bluetooth…) — `reason` lists them. */
export class UnsupportedCapability extends BaseError {

	constructor(public readonly reason: string) {
		super(400, "unsupported_capability", reason)
		Object.setPrototypeOf(this, UnsupportedCapability.prototype);
	}

}

/**
 * A Continue / Stop / value edit for a debug session that's gone (stopped,
 * idle too long, or another user's).
 */
export class DebugSessionNotFound extends BaseError {

	constructor() {
		super(404, "debug_session_not_found")
	}

}
