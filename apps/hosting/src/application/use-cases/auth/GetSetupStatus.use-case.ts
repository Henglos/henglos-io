import { Inject, Injectable } from "@nestjs/common";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import type { SetupStatusOut } from "@henglosio/shared";

/**
 * Whether the installation is set up — it has its user. The studio shows the
 * setup page (create the account) until it has, the sign-in page after.
 */
@Injectable()
export class GetSetupStatusUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
	) {}

	async execute(): Promise<SetupStatusOut> {

		const hasUser = await this.userRepository.hasUserRegistered();
		return { hasUser };

	}

}
