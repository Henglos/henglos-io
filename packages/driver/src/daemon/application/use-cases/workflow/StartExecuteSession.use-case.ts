import { injectable } from "tsyringe";
import type { BoardInstall } from "@henglosio/shared";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { ReplSession } from "../../services/ReplSession.service.js";
import { BoardInstaller } from "../../services/BoardInstaller.service.js";
import { ExecuteSessionsService, type StartingExecuteSession } from "../../services/ExecuteSessions.service.js";

// Runs a workflow's execution as a session: the board's REPL is opened once
// (which stops whatever main.py was playing) and kept while hosting drives the
// graph traversal one Execute/RESPONSE round-trip at a time. This only forwards
// frame bytes and never interprets them.
//
// The promise it returns resolves on the session's finish (hosting's
// workflow:execute:finish or the task being cancelled), which is what keeps the
// task in "running".
@injectable()
export class StartExecuteSessionUseCase {

	constructor(
		private readonly executeSessions: ExecuteSessionsService,
		private readonly installer: BoardInstaller,
	) {}

	async execute(taskId: string, port: string, _baudrate: number, frame: Uint8Array, ctx: TaskContext, install?: BoardInstall): Promise<void> {

		// A finish can come before the session exists — the hosting gave up
		// while the board was still opening or installing. It's kept here, so
		// the session ends instead of holding the port forever.
		const starting: StartingExecuteSession = { ended: false, repl: null };
		this.executeSessions.starting.set(taskId, starting);
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
			this.executeSessions.starting.delete(taskId);
		}
		const repl = starting.repl!;      // the try above either set it or threw

		const donePromise = new Promise<void>((resolve) => {
			this.executeSessions.sessions.set(taskId, { repl, end: resolve });
		});

		const onAbort = () => { void this.executeSessions.finish(taskId); };
		ctx.signal.addEventListener("abort", onAbort, { once: true });

		await this.executeSessions.sendFrame(taskId, repl, frame, ctx);
		await donePromise;

		ctx.signal.removeEventListener("abort", onAbort);
	}

}
