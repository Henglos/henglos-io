import { Inject, Injectable } from "@nestjs/common";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { UserNotFound } from "@/application/errors/User.error";

/** Deletes the user's account, and every workflow of theirs with it. */
@Injectable()
export class DeleteAccountUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
	) {}

	/** @throws UserNotFound when there's no such user. */
	async execute(userId: string) {
		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound;

		await this.workflowRepository.deleteAllByUser(userId);
		await this.userRepository.delete(user.id!);
	}

}
