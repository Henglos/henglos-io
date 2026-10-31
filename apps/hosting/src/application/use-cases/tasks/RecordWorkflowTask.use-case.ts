import { Inject, Injectable } from "@nestjs/common";
import { type TaskCancelInDTO, type TaskStartInDTO, buildRecordProgram } from "@henglosio/shared";

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

/**
 * Records a workflow onto the board: its whole frame sequence is stored
 * there, so the board can run it on its own, without the driver. A `record`
 * task, on the board's port.
 */
@Injectable()
export class RecordWorkflowTaskUseCase {

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
	 * Starts it — its progress comes as the task's events.
	 *
	 * @returns The task, already started.
	 * @throws UserNotFound, DriverNotFound, WorkflowNotFound, DriverOffline;
	 *   ActionNotFound for a workflow with nothing to run; BuildBoardInstall's errors.
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

		// The whole frame sequence is resolved up front — there's no on-device
		// RESPONSE to branch on while recording. See buildRecordProgram.
		const frames = buildRecordProgram(workflow.data);
		if (frames.length === 0) throw new ActionNotFound();
		// The stored program runs on its own: what it uses goes on the board first.
		const install = await this.boardInstall.execute(userId, workflowId, workflow.data);

		const task = Task.create({ type: "record", workflowId, userId, driverId, port });

		await this.taskRegistry.register({
			task,
			teardown: () => { connection.socket.emit("task:cancel", { taskId: task.id } satisfies TaskCancelInDTO); },
		});

		try {
			connection.socket.emit("task:start", {
				taskId: task.id,
				type: "record",
				payload: { workflowId, port, baudrate, frames, install },
			} satisfies TaskStartInDTO);
		} catch (err) {
			await this.taskRegistry.fail(task.id, err instanceof Error ? err.message : String(err));
			throw err;
		}

		return task;

	}

}
