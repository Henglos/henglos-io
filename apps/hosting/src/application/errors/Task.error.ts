import { BaseError } from "./BaseError";

/** No such task — it finished long ago, or it isn't the user's. */
export class TaskNotFound extends BaseError {

	constructor() {
		super(404, "task_not_found");
	}

}

/** A task can't go from one status to the other (e.g. stopping one that's over). */
export class InvalidTaskTransition extends BaseError {

	constructor(from: string, to: string) {
		super(400, "invalid_task_transition", `${from} -> ${to}`);
	}

}
