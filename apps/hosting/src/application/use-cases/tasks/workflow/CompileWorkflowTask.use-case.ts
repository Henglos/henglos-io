import { Inject, Injectable } from "@nestjs/common";
import type { TaskCancelInDTO, TaskStartInDTO } from "@henglosio/shared";

import { Task } from "@/domain/entities/Task";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { type IPackageLinkRepository } from "@/domain/repositories/IPackageLinkRepository.repo";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { TaskRegistry } from "@/application/services/TaskRegistry.service";
import { WorkflowCollabService } from "@/application/services/WorkflowCollab.service";
import { WorkflowPackagesService } from "@/application/services/WorkflowPackages.service";
import { UserNotFound } from "@/application/errors/User.error";
import { DriverNotFound, DriverOffline } from "@/application/errors/Driver.error";
import { WorkflowNotFound, WorkflowWithoutBoard } from "@/application/errors/Workflow.error";

/**
 * Compiles a workflow on a driver: the platform's build turns its runtime and
 * components into what the board's firmware runs. A `compile` task — it needs
 * no board, so no port. The driver first syncs the workflow's packages (they
 * go in the payload): a workflow made or changed since it connected builds too.
 */
@Injectable()
export class CompileWorkflowTaskUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		@Inject("IPackageLinkRepository") private readonly packageLinkRepository: IPackageLinkRepository,
		private readonly driverConnection: DriverConnectionRegistry,
		private readonly taskRegistry: TaskRegistry,
		private readonly collab: WorkflowCollabService,
		private readonly workflowPackages: WorkflowPackagesService,
	) {}

	/**
	 * Starts it — its progress comes as the task's events.
	 *
	 * @returns The task, already started.
	 * @throws UserNotFound, DriverNotFound, WorkflowNotFound, WorkflowWithoutBoard, DriverOffline.
	 */
	async execute(userId: string, driverId: string, workflowId: string): Promise<Task> {

		if (!await this.userRepository.existsById(userId)) throw new UserNotFound();

		const driver = await this.driverRepository.findById(driverId);
		if (!driver || driver.userId !== userId) throw new DriverNotFound();

		// Flush the live collab doc first — see WorkflowCollabService.persistNow.
		await this.collab.persistNow(workflowId);
		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow || workflow.userId !== userId) throw new WorkflowNotFound();

		const boardLink = await this.packageLinkRepository.findById(workflow.boardId);
		if (!boardLink?.pkg && !boardLink?.accountPackage) throw new WorkflowWithoutBoard();

		const connection = this.driverConnection.getByDriverId(driverId);
		if (!connection) throw new DriverOffline();

		const packages = await this.workflowPackages.packagesOf(workflow);

		const task = Task.create({ type: "compile", workflowId, userId, driverId });

		await this.taskRegistry.register({
			task,
			teardown: () => { connection.socket.emit("task:cancel", { taskId: task.id } satisfies TaskCancelInDTO); },
		});

		try {
			connection.socket.emit("task:start", {
				taskId: task.id,
				type: "compile",
				// The platform's build compiles these overrides into the board's runtime,
				// and hands the board's options to its firmware script.
				payload: { workflowId, settings: workflow.data.platformSettings ?? {}, options: workflow.data.boardOptions ?? {}, packages },
			} satisfies TaskStartInDTO);
		} catch (err) {
			await this.taskRegistry.fail(task.id, err instanceof Error ? err.message : String(err));
			throw err;
		}

		return task;

	}

}
