import { BaseError } from "./BaseError";

/** Too many requests from this address — the rate limit (see RateLimit.guard). `info`: the seconds to wait. */
export class TooManyRequests extends BaseError {

	constructor(retryAfterSeconds: number) {
		super(429, "too_many_requests", String(retryAfterSeconds));
	}

}
