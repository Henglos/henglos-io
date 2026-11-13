import { EventEmitter } from "node:events";
import { Injectable, Logger } from "@nestjs/common";
import type { DriverTasksState, TaskEvent, TaskRecord, TaskType } from "@henglosio/shared";
import { Task } from "@/domain/entities/Task";
import { TaskNotFound } from "@/application/errors/Task.error";
import { TelemetryService } from "./Telemetry.service";

// Live events kept per task for replay on (re)subscribe. Generous while running
// so a page reload mid-build replays the whole log; compacted hard once the task
// is terminal so finished tasks don't pin memory.
const RING_CAP_RUNNING = 2_000;
const RING_CAP_TERMINAL = 400;
// Terminal entries past this count are evicted (oldest first) — no history
// store behind this, so an evicted task is just gone. The registry only ever
// answers for operations it currently holds in memory.
const MAX_TERMINAL_ENTRIES = 100;
// How long a driver has to answer a `task:start` with its first event. It always
// answers right away (running, or failed), so silence means it never got it.
const START_TIMEOUT_MS = 30_000;
// How long a driver that dropped off has to come back before its tasks fail: a
// blip in the connection shouldn't cost a build.
const DRIVER_GRACE_MS = 30_000;
// What the hosting drives step by step, over a socket it holds. They can't carry
// on across a reconnection: they fail at once, and the driver is told to stop them.
const INTERACTIVE: readonly TaskType[] = ["execute", "repl"];

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
/** A TaskEvent minus the envelope fields the registry stamps on. */
type TaskEventBody = DistributiveOmit<TaskEvent, "taskId" | "seq">;

type RegisterInput = {
	task: Task;
	/** Runs on cancel — emits the stop signal to the driver (`task:cancel`, or
	 *  `workflow:execute:finish` for execute). The registry stays socket-agnostic. */
	teardown: () => void | Promise<void>;
};

type Entry = {
	task: Task;
	ring: TaskEvent[];
	dropped: number;
	lastSeq: number;
	abort: AbortController;
	teardown: () => void | Promise<void>;
	/** Its end went to the telemetry — once, whatever comes after it. */
	reported?: boolean;
	/** Fails it if the driver never answers its `task:start`. */
	startTimer?: NodeJS.Timeout;
};

/** A task event on its way to the studio — `userId` says whose sockets get it. */
export type TaskFanoutMessage = { userId: string; taskId: string; event: TaskEvent };
/** A task its driver must stop. */
export type TaskCancelMessage = { driverId: string; taskId: string };

/**
 * The façade over task state — create an operation, stop it, watch it through
 * its log/status stream. No history: purely in-memory, keyed on the taskId
 * minted when the operation was created. Owns the per-task event ring and fans
 * live events out to `onEvent` listeners (AppWSGateway subscribes). Knows
 * nothing about sockets — that's what breaks the AppWSGateway <-> TaskRegistry
 * cycle.
 *
 * The execution handle (AbortController + teardown) lives here so `stop`
 * works, but the actual work (emit `task:start`, run the execute graph loop) is
 * done by the use-cases.
 */
@Injectable()
export class TaskRegistry {

	private readonly logger = new Logger(TaskRegistry.name);
	private readonly entries = new Map<string, Entry>();
	private readonly bus = new EventEmitter();
	private readonly goneDrivers = new Map<string, NodeJS.Timeout>();
	private seqOut = 0;

	constructor(private readonly telemetry: TelemetryService) {
		this.bus.setMaxListeners(50);
	}

	/**
	 * Listens to every task's events, as they happen.
	 *
	 * @returns A function that stops listening.
	 */
	onEvent(listener: (msg: TaskFanoutMessage) => void): () => void {
		this.bus.on("task.event", listener);
		return () => this.bus.off("task.event", listener);
	}

	/**
	 * Listens to the tasks a driver must stop. Sent through the driver's current
	 * connection, which may not be the one the task started on.
	 *
	 * @returns A function that stops listening.
	 */
	onCancel(listener: (msg: TaskCancelMessage) => void): () => void {
		this.bus.on("task.cancel", listener);
		return () => this.bus.off("task.cancel", listener);
	}

	/** Open the task's runtime entry, return the AbortSignal for any background
	 *  work the caller runs (execute's graph loop). */
	async register(input: RegisterInput): Promise<AbortSignal> {
		const abort = new AbortController();
		const entry: Entry = {
			task: input.task,
			ring: [],
			dropped: 0,
			lastSeq: -1,
			abort,
			teardown: input.teardown,
		};
		this.entries.set(input.task.id, entry);

		entry.startTimer = setTimeout(() => {
			if (entry.task.status !== "queued") return;
			this.requestCancel(entry.task.driverId, entry.task.id);
			void this.applyEvent(entry, { kind: "result", ok: false, error: "driver_no_response" });
		}, START_TIMEOUT_MS);
		entry.startTimer.unref?.();

		this.telemetry.taskStarted(input.task.type, input.task.label ?? input.task.type);
		return abort.signal;
	}

	/** Fail a task before it ever reached the driver (e.g. the `task:start`
	 *  emit threw) so it doesn't orphan as `queued`. */
	async fail(taskId: string, error: string): Promise<void> {
		const entry = this.entries.get(taskId);
		if (entry) await this.applyEvent(entry, { kind: "result", ok: false, error });
	}

	/** Driver -> hosting. `driverId` is the authenticated emitting driver. */
	async ingest(driverId: string, event: TaskEvent): Promise<void> {
		const entry = this.entries.get(event.taskId);
		if (!entry) return;
		if (entry.task.driverId !== driverId) {
			this.logger.warn(`Dropped task event for ${event.taskId}: driver mismatch (${driverId})`);
			return;
		}
		if (event.seq <= entry.lastSeq) return; // reorder / duplicate
		entry.lastSeq = event.seq;
		const { taskId: _t, seq: _s, ...body } = event;
		await this.applyEvent(entry, body as TaskEventBody);
	}

	/** Stop a task. `expectedType` lets each per-operation `/stop` route reject
	 *  a taskId that doesn't belong to its operation, same 404 as a plain miss. */
	async stop(taskId: string, userId: string, expectedType?: TaskType): Promise<Task> {
		const entry = this.entries.get(taskId);
		const task = entry?.task;
		if (!task || task.userId !== userId) throw new TaskNotFound();
		if (expectedType && task.type !== expectedType) throw new TaskNotFound();

		// Over here, but the driver may not know — if it does, this does nothing.
		if (task.isTerminal) {
			this.requestCancel(task.driverId, task.id);
			return task;
		}

		task.requestStop();
		this.emitOut(entry, { kind: "status", status: task.status });

		entry.abort.abort(new Error("cancelled"));
		try {
			await entry.teardown();
		} catch (err) {
			this.logger.warn(`Task ${taskId} teardown failed: ${(err as Error).message}`);
		}
		this.requestCancel(task.driverId, task.id);

		return task;
	}

	/** The task, if this hosting holds it — and it's `userId`'s, when given. */
	find(taskId: string, userId?: string): Task | null {
		const task = this.entries.get(taskId)?.task;
		return task && (userId === undefined || task.userId === userId) ? task : null;
	}

	/** `userId`'s unfinished tasks of `type`. */
	unfinished(userId: string, type: TaskType): Task[] {
		return [...this.entries.values()]
			.map(entry => entry.task)
			.filter(task => task.userId === userId && task.type === type && !task.isTerminal);
	}

	/**
	 * A task as it stands, with the events kept so far — what a (re)subscribing
	 * studio replays. `dropped` is how many older events no longer fit the ring.
	 * Null when this hosting doesn't hold it, or it isn't `userId`'s.
	 */
	async snapshot(taskId: string, userId?: string): Promise<{ record: TaskRecord; events: TaskEvent[]; dropped: number } | null> {
		const entry = this.entries.get(taskId);
		if (!entry) return null;
		if (userId !== undefined && entry.task.userId !== userId) return null;

		return { record: entry.task.toRecord(), events: [...entry.ring], dropped: entry.dropped };
	}

	/**
	 * A driver dropped off. It keeps running what it has, so its tasks wait a
	 * while for it to come back ({@link reconcile}) — all but the interactive
	 * ones, which need the socket that's gone.
	 */
	async markDriverGone(driverId: string): Promise<void> {
		for (const entry of this.unfinishedOf(driverId)) {
			if (INTERACTIVE.includes(entry.task.type)) await this.applyEvent(entry, { kind: "result", ok: false, error: "driver_disconnected" });
			else this.emitOut(entry, { kind: "log", stream: "info", line: "The driver disconnected — waiting for it to come back.", ts: new Date().toISOString() });
		}

		clearTimeout(this.goneDrivers.get(driverId));
		const timer = setTimeout(() => {
			this.goneDrivers.delete(driverId);
			for (const entry of this.unfinishedOf(driverId)) void this.applyEvent(entry, { kind: "result", ok: false, error: "driver_disconnected" });
		}, DRIVER_GRACE_MS);
		timer.unref?.();
		this.goneDrivers.set(driverId, timer);
	}

	/**
	 * A driver connected and said what it has: makes this hosting's view match.
	 *
	 * - Running there, unknown here (this hosting restarted): adopted, so it can
	 *   be seen and stopped again — if it's interactive, nothing can drive it any
	 *   more, so it's stopped instead.
	 * - Running there, over here: stopped.
	 * - Unfinished here, not running there: ended as the driver says it ended, or
	 *   failed when it doesn't know it (it restarted).
	 *
	 * @param since When the driver was asked: a task created after it isn't in its answer.
	 * @returns The tasks the driver must stop.
	 */
	async reconcile(driverId: string, userId: string, state: DriverTasksState, since: Date): Promise<string[]> {
		clearTimeout(this.goneDrivers.get(driverId));
		this.goneDrivers.delete(driverId);

		const toCancel: string[] = [];
		const running = new Set(state.running.map(task => task.taskId));

		for (const remote of state.running) {
			const entry = this.entries.get(remote.taskId);

			if (entry) {
				if (entry.task.isTerminal || entry.task.status === "stopping") toCancel.push(remote.taskId);
				continue;
			}

			if (INTERACTIVE.includes(remote.type) || !remote.workflowId) {
				toCancel.push(remote.taskId);
				continue;
			}

			const task = Task.adopt({ id: remote.taskId, type: remote.type, workflowId: remote.workflowId, userId, driverId, port: remote.port, startedAt: new Date(remote.startedAt) });
			this.entries.set(task.id, { task, ring: [], dropped: 0, lastSeq: -1, abort: new AbortController(), teardown: () => {} });
		}

		const finished = new Map(state.finished.map(({ taskId, ...outcome }) => [taskId, outcome]));
		for (const entry of this.unfinishedOf(driverId)) {
			if (running.has(entry.task.id) || entry.task.createdAt >= since) continue;
			const outcome = finished.get(entry.task.id);
			await this.applyEvent(entry, outcome ? { kind: "result", ...outcome } : { kind: "result", ok: false, error: "driver_lost_task" });
		}

		return toCancel;
	}

	private unfinishedOf(driverId: string): Entry[] {
		return [...this.entries.values()].filter(entry => entry.task.driverId === driverId && !entry.task.isTerminal);
	}

	private requestCancel(driverId: string, taskId: string): void {
		this.bus.emit("task.cancel", { driverId, taskId } satisfies TaskCancelMessage);
	}

	// ── internals ────────────────────────────────────────────────────────────

	// Moves the task along on a status or a result, then sends the event out.
	private async applyEvent(entry: Entry, body: TaskEventBody): Promise<void> {
		const { task } = entry;

		if (!task.isTerminal && body.kind === "status") {
			if (body.status === "running") task.start();
			else if (body.status === "stopping") task.requestStop();
		}

		if (!task.isTerminal && body.kind === "result") {
			const outcome = body.ok
				? "succeeded" as const
				: task.status === "stopping" ? "cancelled" as const : "failed" as const;
			task.finish(outcome, body.error, body.exitCode);
		}

		if (task.status !== "queued" && entry.startTimer) clearTimeout(entry.startTimer);

		this.emitOut(entry, body);

		if (task.isTerminal) this.onTerminal(entry);
	}

	// Stamps the event (taskId, a hosting-wide seq), keeps it in the ring, fans it out.
	private emitOut(entry: Entry, body: TaskEventBody): void {
		const event = { ...body, taskId: entry.task.id, seq: this.seqOut++ } as TaskEvent;

		entry.ring.push(event);
		const cap = entry.task.isTerminal ? RING_CAP_TERMINAL : RING_CAP_RUNNING;
		while (entry.ring.length > cap) {
			entry.ring.shift();
			entry.dropped++;
		}

		this.bus.emit("task.event", {
			userId: entry.task.userId,
			taskId: entry.task.id,
			event,
		} satisfies TaskFanoutMessage);
	}

	// Once a task is over: reports it, aborts what's still waiting on it, and
	// shrinks its ring — consecutive log lines of a stream merged into one event.
	private onTerminal(entry: Entry): void {
		if (!entry.reported) {
			entry.reported = true;
			const { task } = entry;
			const began = task.startedAt ?? task.createdAt;
			this.telemetry.taskFinished(task.type, task.label ?? task.type, task.status, task.finishedAt ? task.finishedAt.getTime() - began.getTime() : null, task.error);
		}

		// The reason travels with the signal — work waiting on the driver reports
		// why it ended (e.g. the driver's resource_busy) instead of a bare abort.
		entry.abort.abort(new Error(entry.task.error ?? entry.task.status));

		const compacted: TaskEvent[] = [];
		for (const ev of entry.ring) {
			const prev = compacted[compacted.length - 1];
			if (ev.kind === "log" && prev?.kind === "log" && prev.stream === ev.stream) {
				prev.line += `\n${ev.line}`;
			} else {
				compacted.push(ev);
			}
		}
		entry.ring = compacted.slice(-RING_CAP_TERMINAL);

		this.evictTerminalEntries();
	}

	private evictTerminalEntries(): void {
		const terminal = [...this.entries.values()]
			.filter(e => e.task.isTerminal)
			.sort((a, b) => (a.task.finishedAt?.getTime() ?? 0) - (b.task.finishedAt?.getTime() ?? 0));

		for (let i = 0; i < terminal.length - MAX_TERMINAL_ENTRIES; i++) {
			this.entries.delete(terminal[i]!.task.id);
		}
	}

}
