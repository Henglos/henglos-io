import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ReplData, TaskCancelInDTO, TaskStartInDTO } from "@henglosio/shared";

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
 * A terminal on the board's REPL, from the studio: a `repl` task on the
 * driver holds the port and passes bytes both ways. This side starts it and
 * relays what's typed — only to a running repl task of the user who typed it.
 * What the board answers is relayed by DriverWSGateway (the same check, the
 * other way round).
 */
@Injectable()
export class ReplTaskUseCase {

	private readonly logger = new Logger(ReplTaskUseCase.name);

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
	async start(userId: string, driverId: string, workflowId: string, port: string): Promise<Task> {

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

	/** What `userId` typed — to the driver running their repl task. */
	input(userId: string, body: ReplData): void {
		const task = this.taskRegistry.find(body.taskId, userId);
		if (!task || task.type !== "repl" || task.isTerminal) return;
		this.driverConnection.getByDriverId(task.driverId)?.socket.emit("repl:input", { taskId: task.id, data: body.data } satisfies ReplData);
	}

	/** The studio went away (closed, reloaded): its terminals close — they'd hold the board otherwise. */
	async endFor(userId: string): Promise<void> {
		for (const task of this.taskRegistry.unfinished(userId, "repl")) {
			await this.taskRegistry.stop(task.id, userId).catch(err => this.logger.warn(`REPL ${task.id} didn't stop: ${err}`));
		}
	}

}
