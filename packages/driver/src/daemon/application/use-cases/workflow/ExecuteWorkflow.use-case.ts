import { injectable } from "tsyringe";
import type { BoardInstall } from "@henglosio/shared";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { SocketIOClient } from "../../../infrastructure/ws/SocketIOClient.impl.js";
import { ReplSession } from "../../services/ReplSession.js";
import { BoardInstaller } from "../../services/BoardInstaller.js";

type Session = {
	repl: ReplSession;
	// Resolves the promise returned by start() — the task stays "running" until
	// hosting sends workflow:execute:finish (or the task is cancelled).
	end: () => void;
};

/** A session still opening the board / installing — no `Session` yet. */
type Starting = {
	/** finish() came in meanwhile. */
	ended: boolean;
	repl: ReplSession | null;
};

// Runs a workflow's execution as a session: the board's REPL is opened once
// (which stops whatever main.py was playing) and kept while hosting drives the
// graph traversal one Execute/RESPONSE round-trip at a time. This use-case
// only forwards frame bytes and never interprets them.
//
// The TaskManager owns the task; this class owns the REPL session. `start`
// returns a promise that resolves on `finish` (hosting's workflow:execute:finish
// or the task being cancelled), which is what keeps the task in "running".
@injectable()
export class ExecuteWorkflowUseCase {

	private readonly sessions = new Map<string, Session>();
	private readonly starting = new Map<string, Starting>();

	constructor(
		private readonly ws: SocketIOClient,
		private readonly installer: BoardInstaller,
	) {}

	async start(taskId: string, port: string, _baudrate: number, frame: Uint8Array, ctx: TaskContext, install?: BoardInstall): Promise<void> {

		// A finish can come before the session exists — the hosting gave up
		// while the board was still opening or installing. It's kept here, so
		// the session ends instead of holding the port forever.
		const starting: Starting = { ended: false, repl: null };
		this.starting.set(taskId, starting);
		try {
			const repl = await ReplSession.open(port);
			starting.repl = repl;
			const stopped = () => ctx.signal.aborted || starting.ended;
			const cancelled = () => new Error(starting.ended ? "cancelled — the session ended before it started" : "cancelled");
			if (stopped()) {
				await repl.close(true);
				throw cancelled();
			}

			// What the workflow uses, on the board before the runtime starts (its
			// first frame) — no build, no flash. A failure here ends the session;
			// so does a cancel: the REPL closes under the install, which then fails.
			if (install) {
				const onAbortInstall = () => { void repl.close(true); };
				ctx.signal.addEventListener("abort", onAbortInstall, { once: true });
				try {
					await this.installer.sync(repl, install, ctx);
				} catch (err) {
					await repl.close(true);
					throw stopped() ? cancelled() : err;
				} finally {
					ctx.signal.removeEventListener("abort", onAbortInstall);
				}
				if (stopped()) {
					await repl.close(true);
					throw cancelled();
				}
			}
		} finally {
			this.starting.delete(taskId);
		}
		const repl = starting.repl!;      // the try above either set it or threw

		const donePromise = new Promise<void>((resolve) => {
			this.sessions.set(taskId, { repl, end: resolve });
		});

		const onAbort = () => { void this.finish(taskId); };
		ctx.signal.addEventListener("abort", onAbort, { once: true });

		await this.sendFrame(taskId, repl, frame, ctx);
		await donePromise;

		ctx.signal.removeEventListener("abort", onAbort);
	}

	async continue(taskId: string, frame: Uint8Array): Promise<void> {

		const session = this.sessions.get(taskId);
		if (!session) {
			this.ws.socket?.emit("workflow:execute:response", { id: taskId, error: `No active execute session: ${taskId}` });
			return;
		}

		await this.sendFrame(taskId, session.repl, frame);

	}

	async finish(taskId: string): Promise<void> {

		const session = this.sessions.get(taskId);
		if (!session) {
			// Still opening/installing: start() ends it — closing the REPL makes
			// an install in progress fail now rather than run to the end.
			const starting = this.starting.get(taskId);
			if (starting && !starting.ended) {
				starting.ended = true;
				await starting.repl?.close(true);
			}
			return;
		}

		this.sessions.delete(taskId);
		// Close BEFORE ending the session: start()'s promise resolves off
		// session.end(), and TaskManager releases the port lock the moment it
		// does — so the port must already be free by then. The soft reset
		// lets main.py play the stored program again.
		await session.repl.close(true);
		session.end();

	}

	private async sendFrame(taskId: string, repl: ReplSession, frame: Uint8Array, ctx?: TaskContext): Promise<void> {

		try {
			const { response } = await repl.exchange(frame, line => {
				console.log(`[execute] (device log) ${line}`);
				ctx?.info(`(device) ${line}`);
			});
			if (!response) throw new Error("The board didn't answer this action (out of sequence, or it never ran)");
			this.ws.socket?.emit("workflow:execute:response", { id: taskId, frame: response.raw });
		} catch (err) {
			this.ws.socket?.emit("workflow:execute:response", {
				id: taskId,
				error: err instanceof Error ? err.message : String(err),
			});
		}

	}

}
