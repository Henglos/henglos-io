import { injectable } from "tsyringe";
import { SocketIOClient } from "../../../infrastructure/ws/SocketIOClient.impl.js";
import { ExecuteSessionsService } from "../../services/ExecuteSessions.service.js";

/** The next frame of an execute session — the hosting's graph walker drives these. */
@injectable()
export class ContinueExecuteSessionUseCase {

	constructor(
		private readonly ws: SocketIOClient,
		private readonly executeSessions: ExecuteSessionsService,
	) {}

	async execute(taskId: string, frame: Uint8Array): Promise<void> {

		const session = this.executeSessions.sessions.get(taskId);
		if (!session) {
			this.ws.socket?.emit("workflow:execute:response", { id: taskId, error: `No active execute session: ${taskId}` });
			return;
		}

		await this.executeSessions.sendFrame(taskId, session.repl, frame);

	}

}
