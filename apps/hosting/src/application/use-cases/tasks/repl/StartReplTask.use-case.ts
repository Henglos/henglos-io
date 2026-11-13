import { Inject, Injectable } from "@nestjs/common";
import type { TaskCancelInDTO, TaskStartInDTO } from "@henglosio/shared";

import { Task } from "@/domain/entities/Task";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { TaskRegistry } from "@/application/services/TaskRegistry.service";
import { UserNotFound } from "@/application/errors/User.error";
import { DriverNotFound, DriverOffline } from "@/application/errors/Driver.error";
import { WorkflowNotFound } from "@/application/errors/Workflow.error";

/**
 * A terminal on the board's REPL, from the studio: a `repl` task on the driver
 * holds the port and passes bytes both ways. What's typed goes through
 * SendReplInputUseCase; what the board answers is relayed by DriverWSGateway.
 */
@Injectable()
export class StartReplTaskUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		private readonly driverConnection: DriverConnectionRegistry,
		private readonly taskRegistry: TaskRegistry,
	) {}

	/**
	 * Opens a terminal on the board at `port`.
	 *
	 * @returns The task, already started.
	 * @throws UserNotFound, DriverNotFound, WorkflowNotFound, DriverOffline.
	 */
	async execute(userId: string, driverId: string, workflowId: string, port: string): Promise<Task> {

		if (!await this.userRepository.existsById(userId)) throw new UserNotFound();

		const driver = await this.driverRepository.findById(driverId);
		if (!driver || driver.userId !== userId) throw new DriverNotFound();

		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow || workflow.userId !== userId) throw new WorkflowNotFound();

		const connection = this.driverConnection.getByDriverId(driverId);
		if (!connection) throw new DriverOffline();

		const task = Task.create({ type: "repl", workflowId, userId, driverId, port });

		await this.taskRegistry.register({
			task,
			teardown: () => { connection.socket.emit("task:cancel", { taskId: task.id } satisfies TaskCancelInDTO); },
		});

		try {
			connection.socket.emit("task:start", {
				taskId: task.id,
				type: "repl",
				payload: { workflowId, port },
			} satisfies TaskStartInDTO);
		} catch (err) {
			await this.taskRegistry.fail(task.id, err instanceof Error ? err.message : String(err));
			throw err;
		}

		return task;

	}

}
