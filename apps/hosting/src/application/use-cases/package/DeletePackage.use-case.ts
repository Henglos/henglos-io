import semver from 'semver';
import { UserNotFound } from '@/application/errors/User.error';
import { PackageInUse, PackageNotFound } from '@/application/errors/services/Package.error';
import { OperationNotPermitted } from '@/application/errors/Auth.error';
import { type IUserRepository } from '@/domain/repositories/IUserRepository.repo';
import { type IAccountPackageRepository } from '@/domain/repositories/IAccountPackageRepository.repo';
import { type IPackageLinkRepository } from '@/domain/repositories/IPackageLinkRepository.repo';
import { type IWorkflowRepository } from '@/domain/repositories/IWorkflowRepository.repo';
import { UpdateWorkflowUseCase } from '@/application/use-cases/workflow/UpdateWorkflow.use-case';
import type { DeletePackageOut } from '@henglosio/shared';
import { Inject, Injectable } from '@nestjs/common';

/** Removes a package version from the user's library. */
@Injectable()
export class DeletePackageUseCase {
	constructor(
		@Inject('IUserRepository') private readonly userRepository: IUserRepository,
		@Inject('IAccountPackageRepository') private readonly accountPackageRepository: IAccountPackageRepository,
		@Inject('IPackageLinkRepository') private readonly packageLinkRepository: IPackageLinkRepository,
		@Inject('IWorkflowRepository') private readonly workflowRepository: IWorkflowRepository,
		private readonly updateWorkflowUseCase: UpdateWorkflowUseCase,
	) {}

	/**
	 * A board version can go even while workflows run on it: each moves to the
	 * newest other version of the same board the user has that its platform
	 * supports — or, with none, is left without a board (the studio says so,
	 * and asks for one before it builds). A component in use can't go: the
	 * workflow's actions would lose their schema.
	 *
	 * @returns The workflows moved to another version, and those left without a board.
	 * @throws UserNotFound; PackageNotFound; OperationNotPermitted when it isn't
	 *   the user's; PackageInUse for a component a workflow uses.
	 */
	async execute(userId: string, accountPackageId: string): Promise<Omit<DeletePackageOut, 'status'>> {
		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound();

		const pkg = await this.accountPackageRepository.findById(accountPackageId);
		if (!pkg) throw new PackageNotFound();
		if (pkg.userId !== userId) throw new OperationNotPermitted();
		if (await this.accountPackageRepository.isUsedAsComponent(accountPackageId)) throw new PackageInUse();

		const moved: DeletePackageOut['moved'] = [];
		const detached: DeletePackageOut['detached'] = [];

		const workflowIds = await this.accountPackageRepository.findBoardWorkflowIds(accountPackageId);
		if (workflowIds.length > 0) {

			const siblings = (await this.accountPackageRepository.findAllByUser(userId, { type: 'board' }))
				.filter(other => other.id !== accountPackageId && other.pkg.spec === pkg.pkg.spec)
				.sort((a, b) => semver.rcompare(a.pkg.version, b.pkg.version));

			for (const workflowId of workflowIds) {
				const workflow = await this.workflowRepository.findById(workflowId);
				if (!workflow) continue;

				const target = siblings.find(other => !other.pkg.platform || semver.satisfies(workflow.platform, other.pkg.platform, { includePrerelease: true }));
				if (target) {
					await this.updateWorkflowUseCase.execute(userId, workflowId, {
						patch: [{ op: 'change:board', path: '', packageId: target.id! }],
					});
					moved.push({ workflowId, name: workflow.data.name, version: target.pkg.version });
				} else {
					await this.packageLinkRepository.detach(workflow.boardId);
					detached.push({ workflowId, name: workflow.data.name });
				}
			}

		}

		await this.accountPackageRepository.delete(accountPackageId);
		return { moved, detached };
	}
}
