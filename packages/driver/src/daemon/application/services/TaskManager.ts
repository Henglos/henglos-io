import { injectable } from "tsyringe";
import { SocketIOClient } from "../../infrastructure/ws/SocketIOClient.impl.js";
import { TaskContext } from "../../domain/entities/TaskContext.js";
import type { ITaskCommand } from "../../domain/interfaces/ICommand.interface.js";
import { LockManager } from "./LockManager.js";

type RunningTask = {
	abort: AbortController;
	/** The lock keys it holds — set once it got them. */
	keys: string[];
	type: string;
	startedAt: number;
};

/**
 * Runs and tracks the long-running task ops. Generalises what
 * ExecuteWorkflowUseCase.sessions did informally: one entry per in-flight task,
 * keyed by the hosting-issued taskId, holding the cancel handle.
 *
 * Lifecycle emitted as `task:event`s via TaskContext: running -> (succeeded |
 * failed | cancelled). No queueing: a run that can't take its locks (see
 * LockManager) fails immediately as `failed` with a `resource_busy` error
 * instead of waiting for the resource to free up.
 */
@injectable()
export class TaskManager {

	private readonly running = new Map<string, RunningTask>();

	constructor(
		private readonly ws: SocketIOClient,
		private readonly locks: LockManager,
	) {}

	isRunning(taskId: string): boolean {
		return this.running.has(taskId);
	}

	run<TPayload>(taskId: string, command: ITaskCommand<TPayload>, payload: TPayload): void {
		if (this.running.has(taskId)) return;

		const abort = new AbortController();
		const ctx = new TaskContext(taskId, this.ws, abort.signal);
		const entry: RunningTask = { abort, keys: [], type: command.type, startedAt: Date.now() };
		this.running.set(taskId, entry);

		void this.execute(command, payload, ctx, entry)
			.finally(() => this.running.delete(taskId));
	}

	cancel(taskId: string): void {
		this.running.get(taskId)?.abort.abort();
	}

	/** What holds `port` now — the lock is exclusive, so one task at most. */
	onPort(port: string): { taskId: string; type: string; startedAt: number }[] {
		const key = `port:${port}`;
		return [...this.running]
			.filter(([, task]) => task.keys.includes(key))
			.map(([taskId, task]) => ({ taskId, type: task.type, startedAt: task.startedAt }));
	}

	private async execute<TPayload>(command: ITaskCommand<TPayload>, payload: TPayload, ctx: TaskContext, entry: RunningTask): Promise<void> {

		const { abort } = entry;
		let release: (() => void) | null = null;
		try {
			const keys = await command.locks(payload);
			release = this.locks.acquire(keys);
			entry.keys = keys;

			if (abort.signal.aborted) {
				ctx.result(false, { error: "cancelled" });
				ctx.status("cancelled");
				return;
			}

			ctx.status("running");
			const result = await command.execute(payload, ctx);
			ctx.result(true, { data: result });
			ctx.status("succeeded");

		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			ctx.result(false, { error: message });
			ctx.status(abort.signal.aborted ? "cancelled" : "failed");
		} finally {
			release?.();
		}
	}

}
