import { BaseError } from "./BaseError";

/** Something the hosting depends on (the database, a registry…) isn't answering. */
export class ServiceUnavailable extends BaseError {

	constructor(message?: string) {
		super(400, "service_unavailable", message);
	}

}

/** An unexpected failure — what's reported for anything that isn't a BaseError. */
export class InternalError extends BaseError {

	constructor() {
		super(500, "internal_error");
	}

}
