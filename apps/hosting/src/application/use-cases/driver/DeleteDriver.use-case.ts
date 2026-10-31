import { DriverNotFound } from "@/application/errors/use-cases/Driver.error";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";
import { Inject, Injectable } from "@nestjs/common";

/** Unpairs a driver from the user's account — it has to pair again to connect. */
@Injectable()
export class DeleteDriverUseCase {

	constructor(
		@Inject('IDriverRepository') private readonly driverRepository: IDriverRepository,
	) {}

	/** @throws DriverNotFound when there's no such driver, or it isn't the user's. */
	async execute(userId: string, id: string) {

		const driver = await this.driverRepository.findById(id);
		if (!driver) throw new DriverNotFound;
		if (driver.userId !== userId) throw new DriverNotFound;

		await this.driverRepository.delete(driver.id!);

	}

}
