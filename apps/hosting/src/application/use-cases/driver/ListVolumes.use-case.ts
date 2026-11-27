import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { VolumeDTO, type DriverResultDTO } from "@henglosio/shared";

import { DriverOffline, DriverNotFound, DriverError } from "@/application/errors/Driver.error";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";

/** The removable drives on one of the user's drivers — for a UF2 flash target. Asked to the driver, live. */
@Injectable()
export class ListVolumesUseCase {

	constructor(
		private readonly driverConnections: DriverConnectionRegistry,
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository
	) {}

	/**
	 * @throws DriverNotFound; DriverOffline when it isn't connected or doesn't
	 *   answer within 10 s; DriverError when it answers with an error.
	 */
	async execute(userId: string, driverId: string): Promise<VolumeDTO[]> {

		const driver = await this.driverRepository.findById(driverId);
		if (!driver) throw new DriverNotFound;
		if (driver.userId !== userId) throw new DriverNotFound;

		const driverConnection = this.driverConnections.getByDriverId(driverId);
		if (!driverConnection) throw new DriverOffline;

		const commandId = randomUUID();

		return new Promise<VolumeDTO[]>((resolve, reject) => {

			const timeout = setTimeout(() => {
				driverConnection.socket.off('volume:list:result', handler);
				reject(new DriverOffline);
			}, 10_000);

			const handler = (body: DriverResultDTO) => {
				if (body.id !== commandId) return;
				clearTimeout(timeout);
				driverConnection.socket.off('volume:list:result', handler);
				if (body.type === 'error') reject(new DriverError);
				else resolve(body.data.volumes);
			};

			driverConnection.socket.on('volume:list:result', handler);
			driverConnection.socket.emit('volume:list', { id: commandId });

		});

	}

}
