import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Socket } from "socket.io";
import {
	type DriverExecuteFrameInDTO,
	type DriverExecuteFinishInDTO,
	type TaskCancelInDTO,
	type TaskStartInDTO,
	buildRequestFrame,
	parseFrame,
	parseResponse,
	buildTriggerPollPayload,
	FrameType,
	OutputId,
} from "@henglosio/shared";
import {
	computeWireInstanceId,
	GenerateExecuteCommand,
	ResolveNextAction,
	SUCCESS_OUTPUT_ID,
	withoutDisabledActions,
	workflowTriggers,
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
import { ActionNotFound, WorkflowNotFound } from "@/application/errors/Workflow.error";
import { BuildBoardInstall } from "./BuildBoardInstall";
import { FIRST_RESPONSE_TIMEOUT_MS, RESPONSE_TIMEOUT_MS } from "./actionResponse";

// How long a TRIGGER_POLL waits on the board for a trigger to fire, between
// branches of a workflow with nothing else to do (Start once, or no wire out
// of it). Short enough that a Stop isn't held up by it.
const TRIGGER_WAIT_MS = 1000;

// What was sent last, when it isn't an action: a TRIGGER_POLL.
const POLL = Symbol("poll");

// Waits for the driver's relay of the device's RESPONSE for a specific session,
// or rejects on timeout / abort. Several executions can be in flight on the same
// driver socket, hence the id filter.
function awaitDriverResponse(socket: Socket, taskId: string, signal: AbortSignal, timeoutMs: number): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {

		const handler = (data: { id: string; frame?: Uint8Array; error?: string }) => {
			if (data.id !== taskId) return;
			cleanup();
			if (data.error) reject(new Error(data.error));
			else if (data.frame) resolve(data.frame);
			else reject(new Error("Empty response from driver"));
		};

		const onAbort = () => { cleanup(); reject(new Error("aborted")); };

		const timer = setTimeout(() => { cleanup(); reject(new Error("Timed out waiting for device response")); }, timeoutMs);

		function cleanup() {
			clearTimeout(timer);
			socket.off("workflow:execute:response", handler);
			signal.removeEventListener("abort", onAbort);
		}

		if (signal.aborted) return onAbort();
		signal.addEventListener("abort", onAbort);
		socket.on("workflow:execute:response", handler);
	});
}

/**
 * Play: runs a workflow on the board, live, from the hosting. The board only
 * runs one action at a time — the graph is walked here: each answer (the
 * output it ended on) picks the next action, sent as the next EXECUTE frame
 * through the driver's execute session. An `execute` task, on the board's port.
 */
@Injectable()
export class ExecuteWorkflowTaskUseCase {

	private readonly logger = new Logger(ExecuteWorkflowTaskUseCase.name);
	private readonly generateExecuteCommand = new GenerateExecuteCommand();
	private readonly resolveNextAction = new ResolveNextAction();

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		private readonly driverConnection: DriverConnectionRegistry,
		private readonly taskRegistry: TaskRegistry,
		private readonly collab: WorkflowCollabService,
		private readonly boardInstall: BuildBoardInstall,
	) {}

	/**
	 * Starts it and returns at once — the run goes on in the background until
	 * it ends or is stopped.
	 *
	 * @returns The task, already started.
	 * @throws UserNotFound, DriverNotFound, WorkflowNotFound, DriverOffline;
	 *   ActionNotFound when there's nothing to run; BuildBoardInstall's errors.
	 */
	async execute(userId: string, driverId: string, workflowId: string, port: string, baudrate: number): Promise<Task> {

		if (!await this.userRepository.existsById(userId)) throw new UserNotFound();

		const driver = await this.driverRepository.findById(driverId);
		if (!driver || driver.userId !== userId) throw new DriverNotFound();

		// Flush the live collab doc first — see WorkflowCollabService.persistNow.
		await this.collab.persistNow(workflowId);
		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow || workflow.userId !== userId) throw new WorkflowNotFound();

		const connection = this.driverConnection.getByDriverId(driverId);
		if (!connection) throw new DriverOffline();

		// As it runs: disabled actions out, the flow passing through them.
		const runnable = withoutDisabledActions(workflow.data);

		// Its triggers are armed first (their EXECUTEs), then Start runs.
		const opening = [...workflowTriggers(runnable).map(action => action.id), runnable.start.id];
		const requestPayload = this.generateExecuteCommand.execute(runnable, opening[0]!);
		if (!requestPayload) throw new ActionNotFound();
		const frame = buildRequestFrame(requestPayload);
		// What it uses goes on the board before that first frame — see BuildBoardInstall.
		const install = await this.boardInstall.execute(userId, workflowId, workflow.data);

		const task = Task.create({ type: "execute", workflowId, userId, driverId, port });

		const signal = await this.taskRegistry.register({
			task,
			teardown: () => {
				connection.socket.emit("workflow:execute:finish", { id: task.id } satisfies DriverExecuteFinishInDTO);
				connection.socket.emit("task:cancel", { taskId: task.id } satisfies TaskCancelInDTO);
			},
		});

		try {
			connection.socket.emit("task:start", {
				taskId: task.id,
				type: "execute",
				payload: { workflowId, port, baudrate, frame, install },
			} satisfies TaskStartInDTO);
		} catch (err) {
			await this.taskRegistry.fail(task.id, err instanceof Error ? err.message : String(err));
			throw err;
		}

		// Graph traversal runs here (no on-device graph storage). The caller gets
		// the task back immediately; the driver's TaskManager emits the terminal
		// task event once we send workflow:execute:finish.
		void this.runGraph(connection.socket, runnable, task.id, signal, opening)
			.catch(err => this.logger.warn(`Task ${task.id} execution aborted: ${err instanceof Error ? err.message : err}`));

		return task;
	}

	// Start's Mode: "once" runs its branch a single time; anything else loops it.
	private isLoopMode(workflow: IWorkflowRuntime): boolean {
		const modeConfig = workflow.start.configurations.find(c => c.base.displayName.toLowerCase() === "mode");
		return modeConfig?.value !== "once";
	}

	/**
	 * `opening`: what runs first, in order — every trigger's EXECUTE (it arms
	 * it), then Start; its first frame went out with task:start. Then the
	 * branches: Start's again in loop mode, and whichever trigger fired
	 * (TRIGGER_POLL) between them.
	 */
	private async runGraph(socket: Socket, workflow: IWorkflowRuntime, taskId: string, signal: AbortSignal, opening: string[]): Promise<void> {

		const startActionId = workflow.start.id;
		const triggers = workflowTriggers(workflow);
		const pending = opening.slice(1);
		let actionId: string | typeof POLL = opening[0]!;
		// Start with nothing wired out of it loops on nothing — the triggers' turn.
		const loopMode = this.isLoopMode(workflow)
			&& this.resolveNextAction.execute(workflow, startActionId, SUCCESS_OUTPUT_ID) !== undefined;
		const send = (payload: Uint8Array) =>
			socket.emit("workflow:execute:continue", { id: taskId, frame: buildRequestFrame(payload) } satisfies DriverExecuteFrameInDTO);
		const poll = (): typeof POLL => {
			send(buildTriggerPollPayload(loopMode ? 0 : TRIGGER_WAIT_MS));
			return POLL;
		};
		// The first answer comes after the board's install — see FIRST_RESPONSE_TIMEOUT_MS.
		let first = true;

		try {
			for (;;) {
				if (signal.aborted) return;

				const responseFrame = await awaitDriverResponse(socket, taskId, signal, first ? FIRST_RESPONSE_TIMEOUT_MS : RESPONSE_TIMEOUT_MS);
				first = false;
				const parsed = parseFrame(responseFrame);
				const response = parsed?.frameType === FrameType.RESPONSE ? parseResponse(parsed.payload) : null;
				if (!response) {
					throw new Error("Invalid or unexpected response frame from device");
				}

				// The board has no action with this ACTION_ID: the session installed
				// it, so its module didn't load (the device log says why), or the
				// board's runtime is older than the component needs.
				if (response.id === OutputId.ACTION_NOT_FOUND) {
					throw new Error(`Action ${String(actionId)} didn't load on the board — see the device log; if the runtime is older than the component needs, compile and flash the workflow`);
				}

				let nextActionId: string | undefined;

				if (actionId === POLL) {
					// A trigger fired (ID = its INSTANCE_ID): its branch. None did:
					// Start again in loop mode, else keep listening.
					const fired = response.id === 0 ? undefined : triggers.find(trigger => computeWireInstanceId(trigger) === response.id);
					nextActionId = fired ? this.resolveNextAction.execute(workflow, fired.id, SUCCESS_OUTPUT_ID) : undefined;
					if (!nextActionId) {
						if (!loopMode) { actionId = poll(); continue; }
						nextActionId = startActionId;
					}
				} else if (pending.length > 0) {
					// Still opening: a trigger's EXECUTE answers whether it armed.
					if (response.id !== OutputId.SUCCESS) {
						throw new Error(`Trigger ${actionId} couldn't start listening on the board — see the device log`);
					}
					nextActionId = pending.shift()!;
				} else {
					nextActionId = this.resolveNextAction.execute(workflow, actionId, response.id);
				}

				if (!nextActionId) {
					// The branch is over: the triggers' turn, or Start's again.
					if (triggers.length > 0) { actionId = poll(); continue; }
					if (!loopMode || actionId === startActionId) return;
					nextActionId = startActionId;
				}

				const nextPayload = this.generateExecuteCommand.execute(workflow, nextActionId);
				if (!nextPayload) return;

				send(nextPayload);
				actionId = nextActionId;
			}
		} finally {
			socket.emit("workflow:execute:finish", { id: taskId } satisfies DriverExecuteFinishInDTO);
		}
	}

}
