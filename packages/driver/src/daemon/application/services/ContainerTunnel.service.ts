import { randomBytes, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { RunnerProtocol } from "@henglosio/runner";
import { injectable } from "tsyringe";

type SessionHandler = (payload: RunnerProtocol) => void;
type Session = { token: Buffer; handler: SessionHandler };

/**
 * A local HTTP endpoint (port 5758) the build containers report to: `hio build` / `hio flash`
 * POST their output to it (HIO_CALLBACK_URL), and it hands each message to the task it
 * belongs to, by session id.
 *
 * It listens only where the containers reach the host (IContainerRuntime.hostAddress),
 * and a session's messages count only with its token (HIO_CALLBACK_TOKEN, as
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
			const session = this.sessions.get(c.req.param("sessionId"));
			if (!session) return c.text("", 404);
			if (!matches(session.token, c.req.header("Authorization"))) return c.text("", 401);

			const payload = await c.req.json<RunnerProtocol>();
			session.handler(payload);
			return c.text("", 200);
		});

		return new Promise((resolve, reject) => {
			this.server = serve({ fetch: app.fetch, port: this.port, hostname: host }, () => resolve());
			this.server.once("error", reject);
		});
	}

	// `sessionId` is the taskId — the in-container `hio` CLI POSTs its progress
	// to /event/<taskId>, so there's one id across the whole operation. The token
	// goes to the container with the URL, and nowhere else.
	createSession(sessionId: string, handler: SessionHandler): { sessionId: string; url: string; token: string } {
		const token = randomBytes(32);
		this.sessions.set(sessionId, { token, handler });
		return {
			sessionId,
			url: `http://host.docker.internal:${this.port}/event/${sessionId}`,
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

}

// `Authorization: Bearer <token>`, compared in constant time.
function matches(token: Buffer, header: string | undefined): boolean {
	const given = header?.startsWith("Bearer ") ? Buffer.from(header.slice(7), "base64url") : null;
	return !!given && given.length === token.length && timingSafeEqual(given, token);
}
