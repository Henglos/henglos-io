import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DriverResultDTO } from "@henglosio/shared";

import { DriverOffline, DriverNotFound, DriverError } from "@/application/errors/Driver.error";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";

/**
 * Restarts a driver: it answers, then starts itself again and exits — what it
 * ran (a Play, a REPL, a task nothing tracks any more) ends with it, and its
 * ports are free. It comes back online on its own a few seconds later.
 */
@Injectable()
export class RestartDriverUseCase {

	constructor(
		private readonly driverConnections: DriverConnectionRegistry,
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository
	) {}

	/**
	 * Resolves once the driver says it's restarting.
	 *
	 * @throws DriverNotFound; DriverOffline when it isn't connected or doesn't
	 *   answer within 10 s; DriverError when it answers with an error.
	 */
	async execute(userId: string, driverId: string): Promise<void> {

		const driver = await this.driverRepository.findById(driverId);
		if (!driver) throw new DriverNotFound;
		if (driver.userId !== userId) throw new DriverNotFound;

		const driverConnection = this.driverConnections.getByDriverId(driverId);
		if (!driverConnection) throw new DriverOffline;

		const commandId = randomUUID();

		return new Promise<void>((resolve, reject) => {

			const timeout = setTimeout(() => {
				driverConnection.socket.off('driver:restart:result', handler);
				reject(new DriverOffline);
			}, 10_000);

			const handler = (body: DriverResultDTO) => {
				if (body.id !== commandId) return;
				clearTimeout(timeout);
				driverConnection.socket.off('driver:restart:result', handler);
				if (body.type === 'error') reject(new DriverError);
				else resolve();
			};

			driverConnection.socket.on('driver:restart:result', handler);
			driverConnection.socket.emit('driver:restart', { id: commandId });

		});

	}

}
