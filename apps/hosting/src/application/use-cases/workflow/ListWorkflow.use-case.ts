import { UserNotFound } from "@/application/errors/User.error";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { type IPackageLinkRepository } from "@/domain/repositories/IPackageLinkRepository.repo";
import { Inject, Injectable } from "@nestjs/common";

/** A page of the user's workflows, each with its board's name. */
@Injectable()
export class ListWorkflowsUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		@Inject("IPackageLinkRepository") private readonly packageLinkRepository: IPackageLinkRepository,
	) {}

	/**
	 * @param query Text to search the names for ("" for all).
	 * @param segment The page number; `length` how many per page.
	 * @throws UserNotFound.
	 */
	async execute(userId: string, query: string = "",  segment: number, length: number) {
		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound;

		const page = await this.workflowRepository.findPaginatedByUser(userId, query, segment, length);

		// Each workflow's board, by its package's name ("ESP32") — through the
		// link it points at; null once that version was removed (no board).
		const boards = await Promise.all(page.workflows.map(async workflow => {
			const link = await this.packageLinkRepository.findById(workflow.boardId);
			return (link?.pkg ?? link?.accountPackage?.pkg)?.name ?? null;
		}));

		return {
			workflows: page.workflows.map((workflow, index) => ({ workflow, board: boards[index] ?? null })),
			nextSegment: page.nextSegment,
		};
	}

}
