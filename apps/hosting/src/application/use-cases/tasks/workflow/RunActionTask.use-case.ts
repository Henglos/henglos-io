import { Inject, Injectable } from "@nestjs/common";
import {
	type ContextValue,
	type DriverExecuteFinishInDTO,
	type DriverExecuteFrameInDTO,
	type TaskCancelInDTO,
	type TaskStartInDTO,
	buildRequestFrame,
	OutputId,
} from "@henglosio/shared";
import { GenerateExecuteCommand, RUN_COMMAND_ID, resolveWorkflowAction } from "@henglosio/workflow";
import { buildContextSetPayload } from "./contextSet";
import { awaitDriverResponse, describeOutput, FIRST_RESPONSE_TIMEOUT_MS, readResponse, readValues, type RunActionResult, type RunValue } from "./actionResponse";
import { BuildBoardInstall } from "../BuildBoardInstall";

export type { RunActionResult, RunValue };

import { Task } from "@/domain/entities/Task";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { TaskRegistry } from "@/application/services/TaskRegistry.service";
import { WorkflowCollabService } from "@/application/services/WorkflowCollab.service";
import { UserNotFound } from "@/application/errors/User.error";
import { DriverNotFound, DriverOffline } from "@/application/errors/Driver.error";
import { ActionNotFound, ActionRunFailed, UnsupportedCapability, WorkflowNotFound } from "@/application/errors/Workflow.error";

/**
 * The ▶ on a node: runs that one action on the board, outside the flow — a
 * RUN frame (RunPacket.py), not an EXECUTE, so the board neither sequences
 * it nor moves its flow. Rides the driver's execute session: RUN of Start
 * first when the workflow has variables (it only seeds them), then the action.
 * Waits for the board and answers with what the action did.
 */
@Injectable()
export class RunActionTaskUseCase {

	private readonly generateExecuteCommand = new GenerateExecuteCommand();

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
	 * @param actionId The node to run.
	 * @returns The output it ended on, and the values it published.
	 * @throws UserNotFound, DriverNotFound, WorkflowNotFound, ActionNotFound,
	 *   DriverOffline; UnsupportedCapability; ActionRunFailed for anything the
	 *   board or the driver failed with.
	 */
	/**
	 * `context`: what the actions before it published, as the studio shows it
	 * (their last run) — written on the board first, so the action reads them
	 * as it would in the flow.
	 */
	async execute(userId: string, driverId: string, workflowId: string, actionId: string, port: string, baudrate: number, context: ContextValue[] = []): Promise<RunActionResult> {

		if (!await this.userRepository.existsById(userId)) throw new UserNotFound();

		const driver = await this.driverRepository.findById(driverId);
		if (!driver || driver.userId !== userId) throw new DriverNotFound();

		// The values on screen, not the last saved ones — see WorkflowCollabService.persistNow.
		await this.collab.persistNow(workflowId);
		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow || workflow.userId !== userId) throw new WorkflowNotFound();

		const resolved = resolveWorkflowAction(workflow.data, actionId);
		if (!resolved) throw new ActionNotFound();

		const connection = this.driverConnection.getByDriverId(driverId);
		if (!connection) throw new DriverOffline();

		// Same packets an EXECUTE of them would be — compile errors (a value too
		// big, a dangling bind) surface here, before anything reaches the board.
		const frames: Uint8Array<ArrayBuffer>[] = [];
		const seedsVariables = (workflow.data.variables ?? []).some(variable => variable.initial !== null);
		// The variables as the studio has them — not what an earlier session left (fresh).
		if (seedsVariables && actionId !== workflow.data.start.id) {
			frames.push(buildRequestFrame(this.generateExecuteCommand.execute(workflow.data, workflow.data.start.id, RUN_COMMAND_ID, { freshVariables: true })!));
		}
		// The outputs on screen of the actions before it.
		const contextFrame = context.length > 0 ? buildRequestFrame(buildContextSetPayload(context)) : null;
		if (contextFrame) frames.push(contextFrame);
		const actionPayload = this.generateExecuteCommand.execute(workflow.data, actionId, RUN_COMMAND_ID);
		if (!actionPayload) throw new ActionNotFound();
		frames.push(buildRequestFrame(actionPayload));

		const task = Task.create({ type: "execute", workflowId, userId, driverId, port, label: "run" });
		const signal = await this.taskRegistry.register({
			task,
			teardown: () => {
				connection.socket.emit("workflow:execute:finish", { id: task.id } satisfies DriverExecuteFinishInDTO);
				connection.socket.emit("task:cancel", { taskId: task.id } satisfies TaskCancelInDTO);
			},
		});

		const socket = connection.socket;

		try {

			// What the workflow uses goes on the board before the first frame — the
			// whole workflow's, not just this action's, so the next Play has nothing to send.
			const install = await this.boardInstall.execute(userId, workflowId, workflow.data);

			let response: Uint8Array | null = null;
			for (const [index, frame] of frames.entries()) {
				const answer = awaitDriverResponse(socket, task.id, signal, index === 0 ? FIRST_RESPONSE_TIMEOUT_MS : undefined);
				if (index === 0) {
					socket.emit("task:start", { taskId: task.id, type: "execute", payload: { workflowId, port, baudrate, frame, install } } satisfies TaskStartInDTO);
				} else {
					socket.emit("workflow:execute:continue", { id: task.id, frame } satisfies DriverExecuteFrameInDTO);
				}
				response = await answer;
				if (frame === contextFrame && readResponse(response).id !== OutputId.SUCCESS) {
					throw new Error("The board had no room for the outputs to run with — raise Pipeline entries in Settings → Limits");
				}
			}

			if (!response) throw new Error("No answer from the board");
			const result = readResponse(response);

			if (result.id === OutputId.ACTION_NOT_FOUND) {
				throw new Error(`"${resolved.action.alias}" didn't load on the board — see the device log; if the runtime is older than the component needs, compile and flash the workflow`);
			}

			const values = readValues(resolved.action, result);

			return { taskId: task.id, output: { id: result.id, name: describeOutput(resolved.action, result.id) }, values };

		} catch (err) {
			// The board can't run it (no wifi…): said as it is, with the nodes it lacks for.
			if (err instanceof UnsupportedCapability) {
				await this.taskRegistry.fail(task.id, err.reason);
				throw err;
			}
			const reason = err instanceof Error ? err.message : String(err);
			await this.taskRegistry.fail(task.id, reason);
			// With its reason — a plain Error would reach the studio as a bare 500.
			throw new ActionRunFailed(reason);
		} finally {
			socket.emit("workflow:execute:finish", { id: task.id } satisfies DriverExecuteFinishInDTO);
		}

	}

}
