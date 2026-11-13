import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type { Socket } from "socket.io";
import {
	type DriverExecuteFrameInDTO,
	buildRequestFrame,
	buildTriggerPollPayload,
	OutputId,
} from "@henglosio/shared";
import {
	computeWireInstanceId,
	SUCCESS_OUTPUT_ID,
	ResolveNextAction,
	resolveWorkflowAction,
	withoutDisabledActions,
	type IWorkflowRuntime,
} from "@henglosio/workflow";

import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { TaskRegistry } from "@/application/services/TaskRegistry.service";
import { WorkflowCollabService } from "@/application/services/WorkflowCollab.service";
import { ActionRunFailed, DebugSessionNotFound, UnsupportedCapability, WorkflowNotFound } from "@/application/errors/Workflow.error";
import { awaitDriverResponse, describeOutput, readResponse, readValues, type RunValue } from "@/application/use-cases/tasks/workflow/actionResponse";

// A session nobody continues is closed after this — it holds the board's REPL.
const IDLE_TIMEOUT_MS = 15 * 60_000;
// How long a new session waits for an old one's REPL to close.
const STALE_RELEASE_TIMEOUT_MS = 5000;
// One TRIGGER_POLL while listening — the studio asks again until the trigger
// fires or it stops (a Stop waits for at most one of these).
const LISTEN_WAIT_MS = 2000;

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

export type DebugSession = {
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
 * Debug mode's open sessions, and what stepping through them takes — what the
 * debug use cases share. The flow, one action at a time: same traversal as an
 * execute (EXECUTE frames, the board sequencing them), but it stops after every
 * action until Continue — so its outputs can be read, the next action's configs
 * edited (Continue re-reads the workflow), and what the board holds overwritten
 * (CONTEXT_SET) before the next action reads it.
 *
 * Rides the driver's execute session like an execute task: the REPL stays open
 * between steps.
 */
@Injectable()
export class DebugSessionsService implements OnModuleDestroy {

	private readonly logger = new Logger(DebugSessionsService.name);
	private readonly resolveNextAction = new ResolveNextAction();
	readonly sessions = new Map<string, DebugSession>();

	constructor(
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		private readonly taskRegistry: TaskRegistry,
		private readonly collab: WorkflowCollabService,
	) {}

	// The hosting shuts down: every session ends, freeing the boards.
	onModuleDestroy() {
		for (const session of this.sessions.values()) session.finish();
	}

	// The workflow as it is on screen right now, as it runs. @throws WorkflowNotFound.
	async load(workflowId: string, userId: string): Promise<IWorkflowRuntime> {
		// The values on screen, not the last saved ones — see WorkflowCollabService.persistNow.
		await this.collab.persistNow(workflowId);
		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow || workflow.userId !== userId) throw new WorkflowNotFound();
		// As it runs: disabled actions out, the flow passing through them —
		// re-read every step, so switching one off while paused applies.
		return withoutDisabledActions(workflow.data);
	}

	/** Closes `userId`'s sessions on `driverId` and waits until the driver let their port go. */
	async releaseStale(userId: string, driverId: string): Promise<void> {
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
	claim(userId: string, sessionId: string): DebugSession {
		const session = this.sessions.get(sessionId);
		if (!session || session.userId !== userId) throw new DebugSessionNotFound();
		if (session.busy) throw new ActionRunFailed("The debugger is already running a step");
		session.busy = true;
		this.touch(session);
		return session;
	}

	// Restarts the idle timer: a session nobody steps for IDLE_TIMEOUT_MS closes.
	touch(session: DebugSession) {
		clearTimeout(session.idle);
		session.idle = setTimeout(() => {
			this.logger.log(`Debug session ${session.id} idle — closing it`);
			session.finish();
		}, IDLE_TIMEOUT_MS);
	}

	/** What runs after `actionId` ended on `outputId` — back to Start when nothing's connected, in loop mode (a debug from Start). */
	nextAfter(session: DebugSession, workflow: IWorkflowRuntime, actionId: string, outputId: number): string | null {
		const next = this.resolveNextAction.execute(workflow, actionId, outputId) ?? null;
		if (!next && session.loop && session.entryId === session.startActionId && actionId !== session.startActionId) return session.startActionId;
		return next;
	}

	/**
	 * One TRIGGER_POLL: paused before the trigger's branch once it fired, still
	 * listening otherwise — the studio asks again (Continue) while it listens.
	 */
	async listen(session: DebugSession): Promise<DebugState> {
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
	listening(session: DebugSession, ran: DebugState["ran"]): DebugState {
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
	step(session: DebugSession, workflow: IWorkflowRuntime, actionId: string, frame: Uint8Array, outputId?: number): DebugState {

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
	async abort(session: DebugSession, err: unknown): Promise<Error> {
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

}
