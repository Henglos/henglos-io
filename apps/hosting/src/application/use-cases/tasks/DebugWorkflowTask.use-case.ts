import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type { Socket } from "socket.io";
import {
	type DriverExecuteFinishInDTO,
	type DriverExecuteFrameInDTO,
	type TaskCancelInDTO,
	type TaskStartInDTO,
	buildRequestFrame,
	buildTriggerPollPayload,
	CommandId,
	OutputId,
} from "@henglosio/shared";
import {
	computeWireInstanceId,
	GenerateExecuteCommand,
	SUCCESS_OUTPUT_ID,
	workflowEntries,
	ResolveNextAction,
	generateId,
	resolveWorkflowAction,
	withoutDisabledActions,
	type IWorkflowRuntime,
} from "@henglosio/workflow";

import { Task } from "@/domain/entities/Task";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { TaskRegistry } from "@/application/services/TaskRegistry.service";
import { WorkflowCollabService } from "@/application/services/WorkflowCollab.service";
import { UserNotFound } from "@/application/errors/User.error";
import { DriverNotFound, DriverOffline } from "@/application/errors/Driver.error";
import { ActionNotFound, ActionRunFailed, DebugSessionNotFound, UnsupportedCapability, WorkflowNotFound } from "@/application/errors/Workflow.error";
import { awaitDriverResponse, describeOutput, FIRST_RESPONSE_TIMEOUT_MS, readResponse, readValues, type RunValue } from "./actionResponse";
import { BuildBoardInstall } from "./BuildBoardInstall";

// A session nobody continues is closed after this — it holds the board's REPL.
const IDLE_TIMEOUT_MS = 15 * 60_000;
// How long a new session waits for an old one's REPL to close.
const STALE_RELEASE_TIMEOUT_MS = 5000;
// One TRIGGER_POLL while listening — the studio asks again until the trigger
// fires or it stops (a Stop waits for at most one of these).
const LISTEN_WAIT_MS = 2000;

// DataType ordinals (PacketCodec.py) for CONTEXT_SET entries.
const DATA_TYPE = { UINT_8: 0, INT_32: 8, FLOAT_32: 11, BOOL: 12, JSON: 13 } as const;
const ARRAY_BIT = 0x80;

/** A value the debugger writes over what an action published. */
export type DebugValue =
	| { name: string; kind: "int"; value: number }
	| { name: string; kind: "float"; value: number }
	| { name: string; kind: "bool"; value: boolean }
	| { name: string; kind: "text"; value: string }
	| { name: string; kind: "bytes"; value: number[] }
	| { name: string; kind: "json"; value: unknown[] | Record<string, unknown> };

/** Where a debug session stands — what every debugger call answers with. */
export type DebugState = {
	sessionId: string;
	/**
	 * paused: waiting for Continue. listening: a debug from a trigger, waiting
	 * for it to fire — each Continue listens a while (paused once it fired). finished: the
	 * flow ended (a once-mode workflow, or Stop).
	 */
	status: "paused" | "listening" | "finished";
	step: number;
	/** The action that just ran, and what it did. Null before the first one. */
	ran: { actionId: string; output: { id: number; name: string }; values: RunValue[] } | null;
	/** What Continue runs next — null when the flow is over. */
	nextActionId: string | null;
};

type Session = {
	id: string;
	userId: string;
	driverId: string;
	workflowId: string;
	socket: Socket;
	signal: AbortSignal;
	startActionId: string;
	/** Where the session started: Start, or a trigger it listens for. */
	entryId: string;
	/** Waiting for the trigger (entryId) to fire — Continue polls for it. */
	listening: boolean;
	loop: boolean;
	nextActionId: string | null;
	/** The step that just ran and the output it ended on — the next one is worked out again from it if the workflow changed while paused. */
	ran: { actionId: string; outputId: number } | null;
	step: number;
	busy: boolean;
	/** Where it stands — what the last step answered — for a studio that opens it again (a reload, another tab). */
	state: DebugState | null;
	idle: ReturnType<typeof setTimeout>;
	finish: () => void;
};

/**
 * Debug mode: the flow, one action at a time. Same traversal as an execute
 * (EXECUTE frames, the board sequencing them), but it stops after every
 * action until Continue — so its outputs can be read, the next action's
 * configs edited (Continue re-reads the workflow), and what the board holds
 * overwritten (CONTEXT_SET) before the next action reads it.
 *
 * Rides the driver's execute session like an execute task: the REPL stays
 * open between steps.
 */
@Injectable()
export class DebugWorkflowTaskUseCase implements OnModuleDestroy {

	private readonly logger = new Logger(DebugWorkflowTaskUseCase.name);
	private readonly generateExecuteCommand = new GenerateExecuteCommand();
	private readonly resolveNextAction = new ResolveNextAction();
	private readonly sessions = new Map<string, Session>();

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		private readonly driverConnection: DriverConnectionRegistry,
		private readonly taskRegistry: TaskRegistry,
		private readonly collab: WorkflowCollabService,
		private readonly boardInstall: BuildBoardInstall,
	) {}

	// The hosting shuts down: every session ends, freeing the boards.
	onModuleDestroy() {
		for (const session of this.sessions.values()) session.finish();
	}

	/**
	 * Opens the session and runs Start — paused before the first action. From
	 * a trigger (`entryId`): arms it and listens — Continue waits for it to fire.
	 */
	async start(userId: string, driverId: string, workflowId: string, port: string, baudrate: number, entryId?: string): Promise<DebugState> {

		if (!await this.userRepository.existsById(userId)) throw new UserNotFound();

		const driver = await this.driverRepository.findById(driverId);
		if (!driver || driver.userId !== userId) throw new DriverNotFound();

		const workflow = await this.load(workflowId, userId);

		const connection = this.driverConnection.getByDriverId(driverId);
		if (!connection) throw new DriverOffline();

		const entry = entryId ?? workflow.start.id;
		if (!workflowEntries(workflow).includes(entry)) throw new ActionNotFound();
		const startPayload = this.generateExecuteCommand.execute(workflow, entry);
		if (!startPayload) throw new ActionNotFound();

		// A session left paused (a reload, Debug pressed again) still holds the
		// board's REPL — the driver would refuse this one as resource_busy.
		await this.releaseStale(userId, driverId);

		const task = Task.create({ type: "execute", workflowId, userId, driverId, port, label: "debug" });
		const socket = connection.socket;
		const signal = await this.taskRegistry.register({
			task,
			teardown: () => {
				socket.emit("workflow:execute:finish", { id: task.id } satisfies DriverExecuteFinishInDTO);
				socket.emit("task:cancel", { taskId: task.id } satisfies TaskCancelInDTO);
			},
		});

		const session: Session = {
			id: task.id,
			userId,
			driverId,
			workflowId,
			socket,
			signal,
			startActionId: workflow.start.id,
			entryId: entry,
			listening: false,
			loop: workflow.start.configurations.find(c => c.base.displayName.toLowerCase() === "mode")?.value !== "once",
			nextActionId: null,
			ran: null,
			step: 0,
			busy: true,
			state: null,
			idle: setTimeout(() => {}, 0),
			finish: () => {
				clearTimeout(session.idle);
				this.sessions.delete(session.id);
				socket.emit("workflow:execute:finish", { id: session.id } satisfies DriverExecuteFinishInDTO);
			},
		};
		this.sessions.set(session.id, session);

		try {
			// What it uses goes on the board first — so the first answer may take a while.
			const install = await this.boardInstall.execute(userId, workflowId, workflow);
			const answer = awaitDriverResponse(socket, task.id, signal, FIRST_RESPONSE_TIMEOUT_MS);
			socket.emit("task:start", { taskId: task.id, type: "execute", payload: { workflowId, port, baudrate, frame: buildRequestFrame(startPayload), install } } satisfies TaskStartInDTO);
			if (entry === workflow.start.id) return this.step(session, workflow, entry, await answer);

			// A trigger's EXECUTE arms it.
			if (readResponse(await answer).id !== OutputId.SUCCESS) {
				throw new Error("The trigger couldn't start listening on the board — see the device log");
			}
			return this.listening(session, null);
		} catch (err) {
			throw await this.abort(session, err);
		} finally {
			session.busy = false;
		}

	}

	/** Runs the next action (with the workflow as it is now) and pauses again. */
	async continue(userId: string, sessionId: string): Promise<DebugState> {

		const session = this.claim(userId, sessionId);

		try {
			if (session.listening) return await this.listen(session);

			if (!session.nextActionId) {
				session.finish();
				return { sessionId, status: "finished", step: session.step, ran: null, nextActionId: null };
			}

			// Configs edited while paused are in the collab doc — read it back.
			const workflow = await this.load(session.workflowId, userId);
			let actionId: string | null = session.nextActionId;
			// The next one was switched off (or rewired) while paused: go on to
			// whatever now follows the step that ran.
			if (!resolveWorkflowAction(workflow, actionId) && session.ran) {
				actionId = this.nextAfter(session, workflow, session.ran.actionId, session.ran.outputId);
				if (!actionId) {
					session.finish();
					return { sessionId, status: "finished", step: session.step, ran: null, nextActionId: null };
				}
			}
			const payload = this.generateExecuteCommand.execute(workflow, actionId);
			if (!payload) throw new Error("The next action is no longer in the workflow");

			const answer = awaitDriverResponse(session.socket, session.id, session.signal);
			session.socket.emit("workflow:execute:continue", { id: session.id, frame: buildRequestFrame(payload) } satisfies DriverExecuteFrameInDTO);
			return this.step(session, workflow, actionId, await answer);
		} catch (err) {
			// Stopped while it waited (Stop during Listen): the driver ended the
			// task — that's the session over, not a step that failed.
			if (!this.sessions.has(session.id)) return { sessionId, status: "finished", step: session.step, ran: null, nextActionId: null };
			throw await this.abort(session, err);
		} finally {
			session.busy = false;
		}

	}

	/** Overwrites values the board holds (what the last action published) before the next one runs. */
	async setValues(userId: string, sessionId: string, values: DebugValue[]): Promise<{ ok: true }> {

		const session = this.claim(userId, sessionId);

		try {
			const entries = values.map(value => {
				const id = generateId(value.name.toLowerCase());
				const { type, data } = this.encode(value);
				const isArray = (type & ARRAY_BIT) !== 0;
				const entry = new Uint8Array(3 + (isArray ? 2 : 0) + data.length);
				const view = new DataView(entry.buffer);
				view.setUint16(0, id, true);
				entry[2] = type;
				if (isArray) view.setUint16(3, data.length, true);
				entry.set(data, isArray ? 5 : 3);
				return entry;
			});

			const payload = new Uint8Array(1 + entries.reduce((sum, entry) => sum + entry.length, 0));
			payload[0] = CommandId.CONTEXT_SET;
			let offset = 1;
			for (const entry of entries) { payload.set(entry, offset); offset += entry.length; }

			const answer = awaitDriverResponse(session.socket, session.id, session.signal);
			session.socket.emit("workflow:execute:continue", { id: session.id, frame: buildRequestFrame(payload) } satisfies DriverExecuteFrameInDTO);
			const response = readResponse(await answer);
			if (response.id !== OutputId.SUCCESS) throw new Error("The board had no room for those values");

			return { ok: true };
		} catch (err) {
			throw await this.abort(session, err);
		} finally {
			session.busy = false;
		}

	}

	/** Where the session stands — to open it again in a studio that lost it. `busy` while a step runs (or Start, before the first answer). */
	get(userId: string, sessionId: string): DebugState & { workflowId: string; entryId: string; busy: boolean } {
		const session = this.sessions.get(sessionId);
		if (!session || session.userId !== userId) throw new DebugSessionNotFound();
		const state = session.state ?? { sessionId, status: "paused" as const, step: 0, ran: null, nextActionId: null };
		return { ...state, workflowId: session.workflowId, entryId: session.entryId, busy: session.busy };
	}

	/** Ends the session — the driver closes the REPL and frees the port. @throws DebugSessionNotFound. */
	stop(userId: string, sessionId: string): { stopped: true } {
		const session = this.sessions.get(sessionId);
		if (!session || session.userId !== userId) throw new DebugSessionNotFound();
		session.finish();
		return { stopped: true };
	}

	// ── internals ─────────────────────────────────────────────────────────────

	// The workflow as it is on screen right now, as it runs. @throws WorkflowNotFound.
	private async load(workflowId: string, userId: string): Promise<IWorkflowRuntime> {
		// The values on screen, not the last saved ones — see WorkflowCollabService.persistNow.
		await this.collab.persistNow(workflowId);
		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow || workflow.userId !== userId) throw new WorkflowNotFound();
		// As it runs: disabled actions out, the flow passing through them —
		// re-read every step, so switching one off while paused applies.
		return withoutDisabledActions(workflow.data);
	}

	/** Closes `userId`'s sessions on `driverId` and waits until the driver let their port go. */
	private async releaseStale(userId: string, driverId: string): Promise<void> {
		const stale = [...this.sessions.values()].filter(session => session.userId === userId && session.driverId === driverId);
		for (const session of stale) session.finish();
		// The driver closes the REPL, then ends the task — its signal aborts once
		// the result reaches the registry, and the port lock is free by then.
		await Promise.all(stale.map(session => new Promise<void>(resolve => {
			if (session.signal.aborted) return resolve();
			const timer = setTimeout(resolve, STALE_RELEASE_TIMEOUT_MS);
			session.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
		})));
	}

	/** The session, owned by `userId`, idle — then marked busy until the caller's `finally`. */
	private claim(userId: string, sessionId: string): Session {
		const session = this.sessions.get(sessionId);
		if (!session || session.userId !== userId) throw new DebugSessionNotFound();
		if (session.busy) throw new ActionRunFailed("The debugger is already running a step");
		session.busy = true;
		this.touch(session);
		return session;
	}

	// Restarts the idle timer: a session nobody steps for IDLE_TIMEOUT_MS closes.
	private touch(session: Session) {
		clearTimeout(session.idle);
		session.idle = setTimeout(() => {
			this.logger.log(`Debug session ${session.id} idle — closing it`);
			session.finish();
		}, IDLE_TIMEOUT_MS);
	}

	/** What runs after `actionId` ended on `outputId` — back to Start when nothing's connected, in loop mode (a debug from Start). */
	private nextAfter(session: Session, workflow: IWorkflowRuntime, actionId: string, outputId: number): string | null {
		const next = this.resolveNextAction.execute(workflow, actionId, outputId) ?? null;
		if (!next && session.loop && session.entryId === session.startActionId && actionId !== session.startActionId) return session.startActionId;
		return next;
	}

	/**
	 * One TRIGGER_POLL: paused before the trigger's branch once it fired, still
	 * listening otherwise — the studio asks again (Continue) while it listens.
	 */
	private async listen(session: Session): Promise<DebugState> {
		const answer = awaitDriverResponse(session.socket, session.id, session.signal);
		session.socket.emit("workflow:execute:continue", { id: session.id, frame: buildRequestFrame(buildTriggerPollPayload(LISTEN_WAIT_MS)) } satisfies DriverExecuteFrameInDTO);
		const frame = await answer;
		const fired = readResponse(frame).id;

		// Re-read now: a branch edited while it listened runs as it is now.
		const workflow = await this.load(session.workflowId, session.userId);
		const trigger = resolveWorkflowAction(workflow, session.entryId)?.action;
		if (fired === 0 || !trigger || computeWireInstanceId(trigger) !== fired) return this.listening(session, session.state?.ran ?? null);

		session.listening = false;
		return this.step(session, workflow, trigger.id, frame, SUCCESS_OUTPUT_ID);
	}

	/** The session listening for its trigger again — `ran`: the step that ended the last branch, kept on screen. */
	private listening(session: Session, ran: DebugState["ran"]): DebugState {
		session.listening = true;
		session.nextActionId = null;
		this.touch(session);
		session.state = { sessionId: session.id, status: "listening", step: session.step, ran, nextActionId: null };
		return session.state;
	}

	/**
	 * Reads what `actionId` did and works out what runs next (looping back to
	 * Start like an execute). `outputId`: the output it went out on, when the
	 * answer's ID isn't that (a TRIGGER_POLL's is the trigger's INSTANCE_ID).
	 */
	private step(session: Session, workflow: IWorkflowRuntime, actionId: string, frame: Uint8Array, outputId?: number): DebugState {

		const parsed = readResponse(frame);
		const response = outputId === undefined ? parsed : { ...parsed, id: outputId };
		const resolved = resolveWorkflowAction(workflow, actionId);
		if (!resolved) throw new Error("The action that ran is no longer in the workflow");

		if (response.id === OutputId.ACTION_NOT_FOUND) {
			throw new Error(`"${resolved.action.alias}" isn't installed on the board — compile and upload the workflow first`);
		}

		const next = this.nextAfter(session, workflow, actionId, response.id);

		session.ran = { actionId, outputId: response.id };
		session.nextActionId = next;
		session.step += 1;
		const ran = { actionId, output: { id: response.id, name: describeOutput(resolved.action, response.id) }, values: readValues(resolved.action, response) };

		// A trigger's branch is over: listen for it again.
		if (!next && session.entryId !== session.startActionId) return this.listening(session, ran);

		// The flow is over (a once-mode workflow): nothing to continue, release the board.
		if (next) this.touch(session);
		else session.finish();

		session.state = { sessionId: session.id, status: next ? "paused" : "finished", step: session.step, ran, nextActionId: next };
		return session.state;

	}

	/** Ends the session on a failed step, reporting why. */
	private async abort(session: Session, err: unknown): Promise<Error> {
		if (err instanceof DebugSessionNotFound || err instanceof WorkflowNotFound) return err;
		// A busy board says so itself — the driver's ResourceBusy points to the board indicator.
		if (err instanceof UnsupportedCapability) {
			await this.taskRegistry.fail(session.id, err.reason);
			session.finish();
			return err;
		}
		const reason = err instanceof Error ? err.message : String(err);
		await this.taskRegistry.fail(session.id, reason);
		session.finish();
		return new ActionRunFailed(reason);
	}

	// A value as CONTEXT_SET carries it: its DATA_TYPE, and its bytes (little-endian numbers).
	private encode(value: DebugValue): { type: number; data: Uint8Array } {
		switch (value.kind) {
			case "bool": return { type: DATA_TYPE.BOOL, data: new Uint8Array([value.value ? 1 : 0]) };
			case "int": {
				const data = new Uint8Array(4);
				new DataView(data.buffer).setInt32(0, value.value, true);
				return { type: DATA_TYPE.INT_32, data };
			}
			case "float": {
				const data = new Uint8Array(4);
				new DataView(data.buffer).setFloat32(0, value.value, true);
				return { type: DATA_TYPE.FLOAT_32, data };
			}
			case "text": return { type: DATA_TYPE.UINT_8 | ARRAY_BIT, data: new TextEncoder().encode(value.value) };
			case "bytes": return { type: DATA_TYPE.UINT_8 | ARRAY_BIT, data: Uint8Array.from(value.value) };
			case "json": return { type: DATA_TYPE.JSON | ARRAY_BIT, data: new TextEncoder().encode(JSON.stringify(value.value)) };
		}
	}

}
