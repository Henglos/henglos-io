import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { SerialPort } from "serialport";
import type { RunnerProtocol } from "@henglosio/runner";
import { injectable } from "tsyringe";

type SessionHandler = (payload: RunnerProtocol) => void;

/**
 * A local HTTP endpoint (port 5758) the build containers report to: `hio build` / `hio flash`
 * POST their output to it (HIO_CALLBACK_URL), and it hands each message to the task it
 * belongs to, by session id.
 */
@injectable()
export class ContainerTunnel {

	private readonly handlers = new Map<string, SessionHandler>();
	private server: ReturnType<typeof serve> | null = null;

	private readonly port: number = 5758;

	constructor() {}

	async initialize(): Promise<void> {
		const app = new Hono();

		app.post("/event/:sessionId", async (c) => {
			const sessionId = c.req.param("sessionId");
			const handler = this.handlers.get(sessionId);
			if (!handler) return c.text("", 404);

			const payload = await c.req.json<RunnerProtocol>();
			handler(payload);
			return c.text("", 200);
		});

		app.post("/serial-control", async (c) => {
			type Step = { dtr?: boolean; rts?: boolean; delayMs?: number };
			const { port, sequence } = await c.req.json<{ port: string; sequence: Step[] }>();

			const serial = new SerialPort({ path: port, baudRate: 115200, autoOpen: false });
			await new Promise<void>((res, rej) => serial.open((err) => err ? rej(err) : res()));

			try {
				for (const step of sequence) {
					if (step.dtr !== undefined || step.rts !== undefined)
						await new Promise<void>((res, rej) => serial.set({ dtr: step.dtr, rts: step.rts }, (err) => err ? rej(err) : res()));
					if (step.delayMs)
						await new Promise<void>((res) => setTimeout(res, step.delayMs));
				}
			} finally {
				await new Promise<void>((res) => serial.close(() => res()));
			}

			return c.text("", 200);
		});

		return new Promise((resolve) => {
			this.server = serve({ fetch: app.fetch, port: this.port }, () => resolve());
		});
	}

	// `sessionId` is the taskId — the in-container `hio` CLI POSTs its progress
	// to /event/<taskId>, so there's one id across the whole operation.
	createSession(sessionId: string, handler: SessionHandler): { sessionId: string; url: string } {
		this.handlers.set(sessionId, handler);
		return {
			sessionId,
			url: `http://host.docker.internal:${this.port}/event/${sessionId}`,
		};
	}

	destroySession(sessionId: string): void {
		this.handlers.delete(sessionId);
	}

	shutdown(): Promise<void> {
		return new Promise((resolve) => {
			if (!this.server) return resolve();
			this.server.close(() => resolve());
		});
	}

}
