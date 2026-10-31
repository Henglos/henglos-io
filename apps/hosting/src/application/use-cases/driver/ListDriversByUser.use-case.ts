import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";
import { Inject, Injectable } from "@nestjs/common";

/** A driver as the studio lists it: the driver, and whether it's connected now. */
export interface DriverEntity  {
	id: string | undefined;
	userId: string;
	deviceHWID: string,
	deviceName: string,
	deviceUser: string,
	name: string;
	online: boolean;
}

/** The user's drivers, each with whether it's online. */
@Injectable()
export class ListDriversByUserUseCase {

	constructor(
		private readonly driverConnectionRegistry: DriverConnectionRegistry,
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository,
	) {}

	async execute(userId: string): Promise<DriverEntity[]> {

		const drivers = await this.driverRepository.findAllByUser(userId);

		return drivers.map<DriverEntity>(driver => ({
			...driver,
			online: this.driverConnectionRegistry.getByDriverId(driver.id!) !== undefined
		}) );

	}

}
