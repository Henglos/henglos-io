import { SocketIOClient } from "../../infrastructure/ws/SocketIOClient.impl.js";

// Streaming handle for the plain request/response driver ops (sync / create /
// delete / removePackage / listDevices). The long-running task ops use
// TaskContext instead.
export class CommandContext {
	constructor(
		private readonly requestId: string,
		private readonly ws: SocketIOClient,
	) {}

	reply<T>(result: T): void {
		console.log(result)
		this.ws.socket?.emit("logs", {
			id: this.requestId,
			data: result,
		});
	}

	fail(error: string): void {
		console.log(error)
		this.ws.socket?.emit("logs", {
			id: this.requestId,
			error,
		});
	}
}
