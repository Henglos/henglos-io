import { Inject, Injectable } from "@nestjs/common";

import { DriverAuthService } from "@/application/services/DriverAuth.service";

import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";

import { InvalidToken } from "@/application/errors/use-cases/Auth.error";

/** A driver's renewed session: a new access token and a new refresh token. */
export type RefreshDriverAuthOutput = {

	token: string;
	refreshToken: string;

};

/** Renews a driver's session — the refresh token rotates: each one works once. */
@Injectable()
export class RefreshDriverAuthUseCase {

	constructor(
		private readonly driverAuthService: DriverAuthService,
		@Inject('IDriverRepository') private readonly driverRepository: IDriverRepository,
	) {}

	/** @throws InvalidToken when it isn't a driver's current refresh token, or it has expired. */
	async execute(rawRefreshToken: string): Promise<RefreshDriverAuthOutput> {

		const hashedToken = this.driverAuthService.hashRefreshToken(rawRefreshToken);
		const driver = await this.driverRepository.findByRefreshToken(hashedToken);

		if (!driver || !driver.isRefreshTokenValid()) throw new InvalidToken();

		const newRawRefreshToken = this.driverAuthService.generateRefreshToken();
		driver.setRefreshToken(this.driverAuthService.hashRefreshToken(newRawRefreshToken));
		await this.driverRepository.update(driver);

		const token = await this.driverAuthService.generateToken(driver);

		return { token, refreshToken: newRawRefreshToken };

	}

}
