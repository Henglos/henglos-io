import { SocketIOClient } from "../../infrastructure/ws/SocketIOClient.impl.js";
import { createLogger } from "../../infrastructure/logger/Logger.js";

const log = createLogger("request");

// Streaming handle for the plain request/response driver ops (sync / create /
// delete / removePackage / listDevices). The long-running task ops use
// TaskContext instead.
export class CommandContext {
	constructor(
		private readonly requestId: string,
		private readonly ws: SocketIOClient,
	) {}

	reply<T>(result: T): void {
		log.debug(this.requestId, result);
		this.ws.socket?.emit("logs", {
			id: this.requestId,
			data: result,
		});
	}

	fail(error: string): void {
		log.warn(`${this.requestId} ${error}`);
		this.ws.socket?.emit("logs", {
			id: this.requestId,
			error,
		});
	}
}
