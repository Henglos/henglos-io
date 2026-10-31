import { randomUUID } from "crypto";
import type { TaskRecord, TaskStatus, TaskType } from "@henglosio/shared";

type TaskCreateInput = {
	type: TaskType;
	workflowId: string;
	userId: string;
	driverId: string;
	/** The board's serial port, for the ops that use one (all but compile). */
	port?: string;
	/** What it is to the user, when `type` doesn't say — "debug" and "run" are execute tasks too. */
	label?: string;
};

const TERMINAL: readonly TaskStatus[] = ["succeeded", "failed", "cancelled"];

/**
 * A driver operation (compile / flash / execute / record) as a first-class
 * handle. The `id` is generated here in the domain — it exists before any I/O,
 * so hosting can return it over HTTP, persist the record and wire the
 * subscription before the driver ACKs. That same id is the driver-command
 * correlation id and the ContainerTunnel session id — never mint a second one.
 *
 * `status` transitions only through the methods below; the live execution
 * handle (AbortController, the running promise) lives in TaskRunner, keyed by
 * this id — never on the entity.
 */
export class Task {

	constructor(
		public readonly id: string,
		public readonly type: TaskType,
		public readonly workflowId: string,
		public readonly userId: string,
		public readonly driverId: string,
		public readonly createdAt: Date,
		private _status: TaskStatus = "queued",
		public startedAt?: Date,
		public finishedAt?: Date,
		public error?: string,
		public exitCode?: number,
		public readonly port?: string,
		public readonly label?: string,
	) {}

	/** A new task, `queued`, with its id already minted. */
	static create(input: TaskCreateInput): Task {
		return new Task(
			randomUUID(),
			input.type,
			input.workflowId,
			input.userId,
			input.driverId,
			new Date(),
			"queued",
			undefined,
			undefined,
			undefined,
			undefined,
			input.port,
			input.label ?? input.type,
		);
	}

	get status(): TaskStatus {
		return this._status;
	}

	/** Whether it's over — succeeded, failed or cancelled. A terminal task never changes again. */
	get isTerminal(): boolean {
		return TERMINAL.includes(this._status);
	}

	/** queued -> running. The driver took its resource locks and started —
	 *  immediately, there's no wait: a busy resource fails the task instead.
	 *  Idempotent / race-tolerant: ignored once past `queued`. */
	start(): void {
		if (this._status !== "queued") return;
		this._status = "running";
		this.startedAt = new Date();
	}

	/** running -> stopping. Cancel requested; awaiting the driver's teardown. */
	requestStop(): void {
		if (this._status === "stopping" || this.isTerminal) return;
		this._status = "stopping";
	}

	/** any non-terminal -> a terminal state. Idempotent once terminal. */
	finish(status: Extract<TaskStatus, "succeeded" | "failed" | "cancelled">, error?: string, exitCode?: number): void {
		if (this.isTerminal) return;
		this._status = status;
		this.finishedAt = new Date();
		this.error = error;
		this.exitCode = exitCode;
	}

	/** The task as the studio receives it (dates as ISO strings). */
	toRecord(): TaskRecord {
		return {
			id: this.id,
			type: this.type,
			workflowId: this.workflowId,
			driverId: this.driverId,
			status: this._status,
			createdAt: this.createdAt.toISOString(),
			startedAt: this.startedAt?.toISOString(),
			finishedAt: this.finishedAt?.toISOString(),
			error: this.error,
			exitCode: this.exitCode,
		};
	}

}
