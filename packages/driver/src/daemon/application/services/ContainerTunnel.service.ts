import { randomBytes, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { serve } from "@hono/node-server";
import type { BrokerConnection, BrokerConnectRequest, BrokerErrorBody, RunnerProtocol } from "@henglosio/runner";
import { injectable } from "tsyringe";

type SessionHandler = (payload: RunnerProtocol) => void;
type Session = { token: Buffer; handler: SessionHandler; broker: BrokerSession | undefined };

/**
 * A flash's broker, as the tunnel serves it (see @henglosio/runner's
 * protocol/broker.ts): the tunnel authorizes each call and hands it over —
 * what each method does is the session's business (FlashBrokerService).
 */
export interface BrokerSession {

	/** `baseUrl`: the session's broker URL, as the container reaches it — for routes the answer names. */
	connect(request: BrokerConnectRequest, baseUrl: string): Promise<BrokerConnection>;
	release(id: string): Promise<void>;
	upload(id: string, body: ReadableStream<Uint8Array>): Promise<void>;

}

/** A broker call refused: answered with `status` and a BrokerErrorBody. */
export class BrokerFailure extends Error {

	constructor(readonly id: BrokerErrorBody["id"], message: string, readonly status: ContentfulStatusCode = 400) {
		super(message);
		this.name = "BrokerFailure";
	}

}

/**
 * A local HTTP endpoint (port 5758) the build containers talk to:
 * - `hio build` / `hio flash` POST their output to /event/<session>
 *   (HIO_CALLBACK_URL), handed to the task it belongs to;
 * - a flash's Runner negotiates how to write the board under /broker/<session>
 *   (HIO_BROKER_URL) — see BrokerSession.
 *
 * It listens only where the containers reach the host (IContainerRuntime.hostAddress),
 * and a session's calls count only with its token (HIO_CALLBACK_TOKEN, as
 * `Authorization: Bearer …`): the session id is the task's id, which the hosting
 * and the studio know too.
 */
@injectable()
export class ContainerTunnel {

	private readonly sessions = new Map<string, Session>();
	private server: ReturnType<typeof serve> | null = null;

	private readonly port: number = 5758;

	constructor() {}

	/** @param host The address to listen on — see IContainerRuntime.hostAddress. */
	async initialize(host: string): Promise<void> {
		const app = new Hono();

		app.post("/event/:sessionId", async (c) => {
			const session = this.authorize(c);
			if (session instanceof Response) return session;

			const payload = await c.req.json<RunnerProtocol>();
			session.handler(payload);
			return c.text("", 200);
		});

		app.post("/broker/:sessionId/connections", (c) => this.broker(c, async (broker) => {
			const request = await c.req.json<BrokerConnectRequest>().catch(() => null);
			if (!request || typeof request.method !== "string") throw new BrokerFailure("bad_request", "A connection needs a `method`.");
			return c.json(await broker.connect({ method: request.method, options: request.options ?? {} } as BrokerConnectRequest, this.brokerUrl(c.req.param("sessionId"))));
		}));

		app.delete("/broker/:sessionId/connections/:connectionId", (c) => this.broker(c, async (broker) => {
			await broker.release(c.req.param("connectionId"));
			return c.body(null, 204);
		}));

		app.put("/broker/:sessionId/connections/:connectionId/upload", (c) => this.broker(c, async (broker) => {
			const body = c.req.raw.body;
			if (!body) throw new BrokerFailure("bad_request", "The upload has no body.");
			await broker.upload(c.req.param("connectionId"), body);
			return c.body(null, 204);
		}));

		return new Promise((resolve, reject) => {
			this.server = serve({ fetch: app.fetch, port: this.port, hostname: host }, () => resolve());
			this.server.once("error", reject);
		});
	}

	// `sessionId` is the taskId — the in-container `hio` CLI POSTs its progress
	// to /event/<taskId>, so there's one id across the whole operation. The token
	// goes to the container with the URLs, and nowhere else. `broker`: a flash's
	// — the session then serves /broker/<taskId> too.
	createSession(sessionId: string, handler: SessionHandler, broker?: BrokerSession): { sessionId: string; url: string; brokerUrl: string; token: string } {
		const token = randomBytes(32);
		this.sessions.set(sessionId, { token, handler, broker });
		return {
			sessionId,
			url: `http://host.docker.internal:${this.port}/event/${sessionId}`,
			brokerUrl: this.brokerUrl(sessionId),
			token: token.toString("base64url"),
		};
	}

	destroySession(sessionId: string): void {
		this.sessions.delete(sessionId);
	}

	shutdown(): Promise<void> {
		return new Promise((resolve) => {
			if (!this.server) return resolve();
			this.server.close(() => resolve());
		});
	}

	private brokerUrl(sessionId: string): string {
		return `http://host.docker.internal:${this.port}/broker/${sessionId}`;
	}

	// The session the call is for, or the answer refusing it.
	private authorize(c: Context): Session | Response {
		const session = this.sessions.get(c.req.param("sessionId") ?? "");
		if (!session) return c.text("", 404);
		if (!matches(session.token, c.req.header("Authorization"))) return c.text("", 401);
		return session;
	}

	// A broker call: authorized, for a session that has a broker, its failures
	// answered as BrokerErrorBody.
	private async broker(c: Context, handle: (broker: BrokerSession) => Response | Promise<Response>): Promise<Response> {
		const session = this.authorize(c);
		if (session instanceof Response) return session;
		if (!session.broker) return c.json({ id: "not_found", message: "This session has no flash broker." } satisfies BrokerErrorBody, 404);
		try {
			return await handle(session.broker);
		} catch (err) {
			const failure = err instanceof BrokerFailure ? err : new BrokerFailure("driver_error", err instanceof Error ? err.message : String(err), 500);
			return c.json({ id: failure.id, message: failure.message } satisfies BrokerErrorBody, failure.status);
		}
	}

}

// `Authorization: Bearer <token>`, compared in constant time.
function matches(token: Buffer, header: string | undefined): boolean {
	const given = header?.startsWith("Bearer ") ? Buffer.from(header.slice(7), "base64url") : null;
	return !!given && given.length === token.length && timingSafeEqual(given, token);
}
