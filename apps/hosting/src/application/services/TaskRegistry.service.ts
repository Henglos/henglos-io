import { EventEmitter } from "node:events";
import { Injectable, Logger } from "@nestjs/common";
import type { TaskEvent, TaskRecord, TaskType } from "@henglosio/shared";
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
};

/** A task event on its way to the studio — `userId` says whose sockets get it. */
export type TaskFanoutMessage = { userId: string; taskId: string; event: TaskEvent };

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

	/** Open the task's runtime entry, return the AbortSignal for any background
	 *  work the caller runs (execute's graph loop). */
	async register(input: RegisterInput): Promise<AbortSignal> {
		const abort = new AbortController();
		this.entries.set(input.task.id, {
			task: input.task,
			ring: [],
			dropped: 0,
			lastSeq: -1,
			abort,
			teardown: input.teardown,
		});

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

		if (task.isTerminal) return task;

		task.requestStop();
		this.emitOut(entry, { kind: "status", status: task.status });

		entry.abort.abort(new Error("cancelled"));
		try {
			await entry.teardown();
		} catch (err) {
			this.logger.warn(`Task ${taskId} teardown failed: ${(err as Error).message}`);
		}

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

	/** A driver dropped off — fail everything of its that hadn't finished. */
	async markDriverGone(driverId: string): Promise<void> {
		for (const entry of this.entries.values()) {
			if (entry.task.driverId !== driverId || entry.task.isTerminal) continue;
			await this.applyEvent(entry, { kind: "result", ok: false, error: "driver_disconnected" });
		}
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
