import { injectable } from "tsyringe";
import type { DriverPortTask, DriverTasksState, TaskStatus, TaskType } from "@henglosio/shared";
import { SocketIOClient } from "../../infrastructure/ws/SocketIOClient.impl.js";
import { TaskContext } from "../../domain/entities/TaskContext.js";
import type { ITaskCommand } from "../../domain/interfaces/ICommand.interface.js";
import { LockManager } from "./LockManager.service.js";
import { createLogger, shortId } from "../../infrastructure/logger/Logger.js";

const log = createLogger("task");

// How many finished tasks are remembered, for a hosting that missed their end.
const FINISHED_KEPT = 50;

type RunningTask = {
	abort: AbortController;
	ctx: TaskContext;
	/** The lock keys it holds — set once it got them. */
	keys: string[];
	/** Lets the keys go. */
	release: (() => void) | null;
	type: string;
	startedAt: number;
	workflowId?: string;
	port?: string;
	/** Its end was reported: nothing it does afterwards counts. */
	settled: boolean;
	/** Ends it if it ignores its cancel. */
	cancelDeadline?: NodeJS.Timeout;
};

/**
 * Runs and tracks the long-running task ops, and is the source of truth for what
 * is running on this machine: the hosting only holds a view of it, rebuilt from
 * {@link state} each time the driver connects.
 *
 * Lifecycle emitted as `task:event`s via TaskContext: running -> (succeeded |
 * failed | cancelled). No queueing: a run that can't take its locks (see
 * LockManager) fails immediately as `failed` with a `resource_busy` error
 * instead of waiting for the resource to free up.
 *
 * A cancel aborts the task's signal. One that doesn't end within
 * {@link cancelGraceMs} is ended anyway and its locks released, so nothing can
 * hold a board forever.
 */
@injectable()
export class TaskManager {

	/** How long a cancelled task has to end on its own. */
	cancelGraceMs = 30_000;

	private readonly running = new Map<string, RunningTask>();
	private readonly finished = new Map<string, { ok: boolean; error?: string }>();

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
		const { workflowId, port } = (payload ?? {}) as { workflowId?: string; port?: string };
		const entry: RunningTask = { abort, ctx, keys: [], release: null, type: command.type, startedAt: Date.now(), workflowId, port, settled: false };
		this.running.set(taskId, entry);
		log.info(`${command.type} ${shortId(taskId)} started${port ? ` on ${port}` : ""}`);

		void this.execute(taskId, command, payload, entry);
	}

	/** A task that can't even start: answered right away, so the hosting doesn't wait for it. */
	reject(taskId: string, error: string): void {
		log.warn(`${shortId(taskId)} rejected: ${error}`);
		const ctx = new TaskContext(taskId, this.ws, new AbortController().signal);
		ctx.result(false, { error });
		ctx.status("failed");
		this.remember(taskId, { ok: false, error });
	}

	cancel(taskId: string): void {
		const entry = this.running.get(taskId);
		if (!entry || entry.abort.signal.aborted) return;

		log.info(`${entry.type} ${shortId(taskId)} cancelling`);
		entry.abort.abort();
		entry.cancelDeadline = setTimeout(() => {
			this.settle(taskId, entry, "cancelled", { error: "cancel_forced: it didn't stop in time" });
		}, this.cancelGraceMs);
		entry.cancelDeadline.unref?.();
	}

	/** What holds `port` now — the lock is exclusive, so one task at most. */
	onPort(port: string): DriverPortTask[] {
		const key = `port:${port}`;
		return [...this.running]
			.filter(([, task]) => task.keys.includes(key))
			.map(([taskId, task]) => ({ taskId, type: task.type, startedAt: task.startedAt }));
	}

	/**
	 * Cancels whatever holds `port`, whether the hosting knows it or not.
	 *
	 * @returns The tasks that were holding it.
	 */
	releasePort(port: string): DriverPortTask[] {
		const tasks = this.onPort(port);
		for (const task of tasks) this.cancel(task.taskId);
		return tasks;
	}

	/** Everything running here, and how the latest tasks ended — what the hosting reconciles with. */
	state(): DriverTasksState {
		return {
			running: [...this.running].map(([taskId, task]) => ({
				taskId,
				type: task.type as TaskType,
				workflowId: task.workflowId,
				port: task.port,
				startedAt: task.startedAt,
			})),
			finished: [...this.finished].map(([taskId, outcome]) => ({ taskId, ...outcome })),
		};
	}

	private async execute<TPayload>(taskId: string, command: ITaskCommand<TPayload>, payload: TPayload, entry: RunningTask): Promise<void> {

		const { abort, ctx } = entry;
		try {
			const keys = await command.locks(payload);
			// Cancelled (and possibly forced out) while looking its keys up.
			if (entry.settled) return;
			entry.release = this.locks.acquire(keys);
			entry.keys = keys;

			if (abort.signal.aborted) {
				this.settle(taskId, entry, "cancelled", { error: "cancelled" });
				return;
			}

			ctx.status("running");
			const data = await command.execute(payload, ctx);
			this.settle(taskId, entry, "succeeded", { data });

		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			this.settle(taskId, entry, abort.signal.aborted ? "cancelled" : "failed", { error });
		}

	}

	// Reports the task's end and frees what it held — once, whichever comes first:
	// the task itself, or its cancel's deadline.
	private settle(taskId: string, entry: RunningTask, status: Extract<TaskStatus, "succeeded" | "failed" | "cancelled">, outcome: { data?: unknown; error?: string }): void {
		if (entry.settled) return;
		entry.settled = true;
		if (entry.cancelDeadline) clearTimeout(entry.cancelDeadline);

		const ok = status === "succeeded";
		const took = `${((Date.now() - entry.startedAt) / 1000).toFixed(1)}s`;
		const what = `${entry.type} ${shortId(taskId)}`;
		if (ok) log.success(`${what} succeeded in ${took}`);
		else if (status === "cancelled") log.info(`${what} cancelled after ${took}${outcome.error?.startsWith("cancel_forced") ? " — forced: it didn't stop in time" : ""}`);
		else log.error(`${what} failed after ${took}: ${outcome.error}`);
		entry.ctx.result(ok, ok ? { data: outcome.data } : { error: outcome.error });
		entry.ctx.status(status);
		this.remember(taskId, ok ? { ok } : { ok, error: outcome.error });

		entry.release?.();
		this.running.delete(taskId);
	}

	private remember(taskId: string, outcome: { ok: boolean; error?: string }): void {
		this.finished.set(taskId, outcome);
		if (this.finished.size > FINISHED_KEPT) this.finished.delete(this.finished.keys().next().value as string);
	}

}
