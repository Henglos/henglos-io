import { injectable } from "tsyringe";
import { TaskContext } from "../../domain/entities/TaskContext.js";
import { SocketIOClient } from "../../infrastructure/ws/SocketIOClient.impl.js";
import { ReplSession } from "./ReplSession.service.js";
import { createLogger, shortId } from "../../infrastructure/logger/Logger.js";

const log = createLogger("board");

export type ExecuteSession = {
	repl: ReplSession;
	// Resolves the promise returned by start() — the task stays "running" until
	// hosting sends workflow:execute:finish (or the task is cancelled).
	end: () => void;
};

/** A session still opening the board / installing — no `Session` yet. */
export type StartingExecuteSession = {
	/** finish() came in meanwhile. */
	ended: boolean;
	repl: ReplSession | null;
};

/**
 * The open execute sessions — what the execute use cases share. The TaskManager
 * owns the task; this owns its REPL session.
 */
@injectable()
export class ExecuteSessionsService {

	readonly sessions = new Map<string, ExecuteSession>();
	readonly starting = new Map<string, StartingExecuteSession>();

	constructor(private readonly ws: SocketIOClient) {}

	/** Ends the session, or the one still starting — closing its REPL, which frees the port. */
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

	/** One frame to the board; its answer, or what went wrong, goes back to the hosting. */
	async sendFrame(taskId: string, repl: ReplSession, frame: Uint8Array, ctx?: TaskContext): Promise<void> {

		try {
			const { response } = await repl.exchange(frame, line => {
				log.info(`${shortId(taskId)} ${line}`);
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
