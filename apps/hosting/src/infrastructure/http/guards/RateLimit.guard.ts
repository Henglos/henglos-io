import { ExecutionContext, HttpException, Injectable } from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerLimitDetail } from "@nestjs/throttler";
import { TooManyRequests } from "@/application/errors/RateLimit.error";

const MINUTE = 60_000;

/**
 * The tighter limits of the routes that check a secret — signing in,
 * registering, refreshing a session, pairing a driver: a handful of tries a
 * minute per address, so passwords and pair tokens can't be guessed by brute
 * force. Applied with @Throttle({ default: … }) on those routes.
 */
export const AUTH_RATE_LIMIT = { limit: 10, ttl: MINUTE };
export const REFRESH_RATE_LIMIT = { limit: 30, ttl: MINUTE };

/** The window the global limit (HIO_RATE_LIMIT) counts over. */
export const RATE_LIMIT_WINDOW = MINUTE;

/**
 * The API's rate limit, per client address (behind a proxy, see
 * HIO_TRUST_PROXY): @nestjs/throttler's guard, global (APP_GUARD), answering
 * like every other error — 429 with `{ id: "too_many_requests", info: <seconds> }`
 * and a Retry-After header. HTTP only: the sockets aren't counted.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {

	override async canActivate(context: ExecutionContext): Promise<boolean> {
		if (context.getType() !== "http") return true;
		return super.canActivate(context);
	}

	protected override async throwThrottlingException(_context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
		// Thrown from a guard — before the exception interceptor — so already
		// as the HttpException it would have made of the error.
		const error = new TooManyRequests(Math.max(1, Math.ceil(detail.timeToBlockExpire)));
		throw new HttpException(error.toResponseString(), error.code);
	}

}
