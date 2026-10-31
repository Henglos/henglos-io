import { UserNotFound } from "@/application/errors/User.error";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo"
import { Inject, Injectable } from "@nestjs/common";


/** The signed-in user's account. */
@Injectable()
export class GetMeAccountUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
	) {}

	/** @throws UserNotFound when there's no such user. */
	async execute(userId: string) {

		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound;

		return user;

	}
	
}
