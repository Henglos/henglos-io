import { Inject, Injectable } from "@nestjs/common";

import { type IBoardSchema } from "@henglosio/workflow";
import { Workflow } from "@/domain/entities/Workflow";

import { WorkflowNotFound } from "@/application/errors/Workflow.error";
import { UserNotFound } from "@/application/errors/User.error";
import { OperationNotPermitted } from "@/application/errors/Auth.error";

import { type IPackageLinkRepository } from "@/domain/repositories/IPackageLinkRepository.repo";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";

/** One workflow of the user — its board's schema refreshed from the board's package. */
@Injectable()
export class GetWorkflowUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		@Inject("IPackageLinkRepository") private readonly packageLinkRepository: IPackageLinkRepository,
	) {}

	/**
	 * `boardMissing`: its board's version was removed (DeletePackage) and the
	 * link it points at has no package left — the workflow keeps the board's
	 * last schema in `data`, but needs another board picked before it builds.
	 *
	 * @throws UserNotFound, WorkflowNotFound; OperationNotPermitted when it isn't the user's.
	 */
	async execute(userId: string, workflowId: string): Promise<{ workflow: Workflow; boardMissing: boolean }> {

		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound;

		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow) throw new WorkflowNotFound;
		if (workflow.userId !== userId) throw new OperationNotPermitted;

		const boardLink = await this.packageLinkRepository.findById(workflow.boardId);
		const boardPackage = boardLink?.pkg ?? boardLink?.accountPackage?.pkg ?? null;
		if (boardLink) {
			const schema = boardPackage?.schema;
			if (schema) {
				workflow.data = {
					...workflow.data,
					board: {
						...workflow.data.board,
						base: schema as IBoardSchema,
					},
				};
			}
		}

		return { workflow, boardMissing: !boardPackage };
	}
}
