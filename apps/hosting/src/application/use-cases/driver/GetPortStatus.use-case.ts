import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DriverPortTask, DriverResultDTO, PortStatusOut } from "@henglosio/shared";

import { DriverError, DriverNotFound, DriverOffline } from "@/application/errors/Driver.error";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { TaskRegistry } from "@/application/services/TaskRegistry.service";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";

const STATUS_TIMEOUT_MS = 10_000;

/**
 * What has a board busy: the driver says which task holds the port, the
 * hosting adds what it knows of it (what it is, its workflow) — nothing for
 * a task it doesn't know any more (it restarted, it was someone else's).
 */
@Injectable()
export class GetPortStatusUseCase {

	constructor(
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository,
		private readonly driverConnections: DriverConnectionRegistry,
		private readonly taskRegistry: TaskRegistry,
	) {}

	/**
	 * @param port The board's serial port on the driver's machine.
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
				connection.socket.off("port:status:result", handler);
				reject(new DriverOffline);
			}, STATUS_TIMEOUT_MS);

			const handler = (body: DriverResultDTO) => {
				if (body.id !== commandId) return;
				clearTimeout(timeout);
				connection.socket.off("port:status:result", handler);
				if (body.type === "error") reject(new DriverError);
				else resolve((body.data as { tasks: DriverPortTask[] }).tasks);
			};

			connection.socket.on("port:status:result", handler);
			connection.socket.emit("port:status", { id: commandId, port });
		});

		return {
			tasks: tasks.map(task => {
				const known = this.taskRegistry.find(task.taskId, userId);
				return known ? { ...task, hostingType: known.type, label: known.label, workflowId: known.workflowId } : task;
			}),
		};

	}

}
