import { BaseError } from "./Base.error.js";

/** An unexpected failure. */
export class InternalError extends BaseError {

	constructor(msg?: string) {
		super("internal_error", msg ?? "unknown");
	}

}
