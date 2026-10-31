import { Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import { type IDriverPairTokenRepository } from "@/domain/repositories/IDriverPairTokenRepository.repo";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { DriverPairToken } from "@/domain/entities/DriverPairToken";
import { UserNotFound } from "@/application/errors/User.error";

/**
 * Makes a pair token for the user — what they pass to `hio driver login` on
 * the computer to pair. Lasts 15 minutes, works once.
 */
@Injectable()
export class GenerateDriverPairTokenUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IDriverPairTokenRepository") private readonly driverPairTokenRepository: IDriverPairTokenRepository
	) {}

	/** @throws UserNotFound when there's no such user. */
	async execute(userId: string) {

		if (!await this.userRepository.existsById(userId)) throw new UserNotFound;

		const pairToken = randomBytes(32).toString("hex");

		const driverPairToken = DriverPairToken.create({ pairToken, userId });

		return await this.driverPairTokenRepository.save(driverPairToken);


	}

}
