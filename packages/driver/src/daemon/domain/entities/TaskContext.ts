import type { TaskEvent, TaskLogStream, TaskStatus } from "@henglosio/shared";
import { SocketIOClient } from "../../infrastructure/ws/SocketIOClient.impl.js";

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
type TaskEventBody = DistributiveOmit<TaskEvent, "taskId" | "seq">;

/**
 * Per-task streaming handle passed to an ICommand. Replaces CommandContext for
 * the long-running task ops (compile / flash / execute / record) — the plain
 * request/response ops keep CommandContext.
 *
 * Every emit carries a per-task monotonic `seq` (this one instance lives for the
 * whole task), so the client can order the two log sources that interleave:
 * the Docker exec stream and the in-container `hio` CLI's HTTP callback.
 *
 * `signal` aborts when hosting sends `task:cancel` — commands should stop
 * promptly and let the abort surface as their rejection.
 */
export class TaskContext {

	private seq = 0;

	constructor(
		readonly taskId: string,
		private readonly ws: SocketIOClient,
		readonly signal: AbortSignal,
	) {}

	private send(body: TaskEventBody): void {
		this.ws.socket?.emit("task:event", {
			...body,
			taskId: this.taskId,
			seq: this.seq++,
		} as TaskEvent);
	}

	log(stream: TaskLogStream, line: string): void {
		this.send({ kind: "log", stream, line, ts: new Date().toISOString() });
	}

	info(line: string): void {
		this.log("info", line);
	}

	progress(phase: string, pct?: number): void {
		this.send({ kind: "progress", phase, pct });
	}

	status(status: TaskStatus): void {
		this.send({ kind: "status", status });
	}

	result(ok: boolean, opts: { data?: unknown; error?: string; exitCode?: number } = {}): void {
		this.send({ kind: "result", ok, ...opts });
	}

}
