import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DriverPortTask, DriverResultDTO, PortStatusOut } from "@henglosio/shared";

import { DriverError, DriverNotFound, DriverOffline } from "@/application/errors/Driver.error";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { TaskRegistry } from "@/application/services/TaskRegistry.service";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";

const RELEASE_TIMEOUT_MS = 10_000;

/**
 * Frees a board: the driver cancels whatever holds its port, whether the hosting
 * knows that task or not — the way out when a task can't be stopped by its id.
 */
@Injectable()
export class ReleasePortUseCase {

	constructor(
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository,
		private readonly driverConnections: DriverConnectionRegistry,
		private readonly taskRegistry: TaskRegistry,
	) {}

	/**
	 * @param port The board's serial port on the driver's machine.
	 * @returns The tasks that were holding it.
	 * @throws DriverNotFound; DriverOffline when it isn't connected or doesn't
	 *   answer in time; DriverError when it answers with an error.
	 */
	async execute(userId: string, driverId: string, port: string): Promise<PortStatusOut> {

		const driver = await this.driverRepository.findById(driverId);
		if (!driver || driver.userId !== userId) throw new DriverNotFound;

		const connection = this.driverConnections.getByDriverId(driverId);
		if (!connection) throw new DriverOffline;

		const commandId = randomUUID();
		const tasks = await new Promise<DriverPortTask[]>((resolve, reject) => {
			const timeout = setTimeout(() => {
				connection.socket.off("port:release:result", handler);
				reject(new DriverOffline);
			}, RELEASE_TIMEOUT_MS);

			const handler = (body: DriverResultDTO) => {
				if (body.id !== commandId) return;
				clearTimeout(timeout);
				connection.socket.off("port:release:result", handler);
				if (body.type === "error") reject(new DriverError);
				else resolve((body.data as { tasks: DriverPortTask[] }).tasks);
			};

			connection.socket.on("port:release:result", handler);
			connection.socket.emit("port:release", { id: commandId, port });
		});

		// So the ones it knows end as cancelled, not failed — and whatever waits on them stops.
		for (const task of tasks) {
			if (this.taskRegistry.find(task.taskId, userId)) await this.taskRegistry.stop(task.taskId, userId);
		}

		return { tasks };

	}

}
