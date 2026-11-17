import { Inject, Injectable } from "@nestjs/common";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IDriverPairTokenRepository } from "@/domain/repositories/IDriverPairTokenRepository.repo";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";
import { WrongPairToken } from "@/application/errors/use-cases/Driver.error";
import { UserNotFound } from "@/application/errors/User.error";
import { Driver } from "@/domain/entities/Driver";
import { DriverAuthService } from "@/application/services/DriverAuth.service";
import { TelemetryService } from "@/application/services/Telemetry.service";

/** What a newly paired driver gets: its first access token, its refresh token, and itself. */
export type MakeDriverPairOutput = {
	token: string;
	refreshToken: string;
	driver: Driver;
};

/**
 * Pairs a driver (`hio driver login <pairToken> <name>`): the pair token says
 * which account it joins. The token is used up, and the driver gets its
 * session.
 */
@Injectable()
export class MakeDriverPairUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IDriverPairTokenRepository") private readonly driverPairTokenRepository: IDriverPairTokenRepository,
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository,
		private readonly driverAuthService: DriverAuthService,
		private readonly telemetry: TelemetryService,
	) {}

	/**
	 * @param pairToken The pair token, as the user passed it.
	 * @param name What the driver shows up as.
	 * @param deviceName The machine's hostname; `deviceUser` the OS user.
	 * @throws WrongPairToken when it doesn't exist or has expired; UserNotFound.
	 */
	async execute(pairToken: string, name: string, deviceName: string, deviceUser: string): Promise<MakeDriverPairOutput> {

		const driverPairToken = await this.driverPairTokenRepository.findByPairToken(pairToken);
		if (!driverPairToken || !driverPairToken.isValid()) throw new WrongPairToken;

		if (!await this.userRepository.existsById(driverPairToken.userId)) throw new UserNotFound;

		let driver = Driver.create({
			deviceName,
			deviceUser,
			name,
			userId: driverPairToken.userId,
		});

		driver = await this.driverRepository.save(driver);

		const rawRefreshToken = this.driverAuthService.generateRefreshToken();
		driver.setRefreshToken(this.driverAuthService.hashRefreshToken(rawRefreshToken));
		driver = await this.driverRepository.update(driver);

		await this.driverPairTokenRepository.delete(driverPairToken.id!);

		const token = await this.driverAuthService.generateToken(driver);
		this.telemetry.capture("driver_paired");

		return { token, refreshToken: rawRefreshToken, driver };

	}

}
