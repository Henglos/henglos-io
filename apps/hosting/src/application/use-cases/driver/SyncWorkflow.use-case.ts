import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PLATFORM_PACKAGE, type PackageDTO, type DriverSyncWorkflowsInDTO } from "@henglosio/shared";

import { OperationNotPermitted } from "@/application/errors/Auth.error";
import { DriverNotFound } from "@/application/errors/Driver.error";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { type IAccountPackageRepository } from "@/domain/repositories/IAccountPackageRepository.repo";
import { type IPackageLinkRepository } from "@/domain/repositories/IPackageLinkRepository.repo";

/**
 * Tells a driver every workflow of its user and the packages each needs (its
 * board, the platform, its components) — so the driver installs what's
 * missing ahead of time, and drops what no workflow uses any more.
 */
@Injectable()
export class SyncWorkflowsUseCase {

	constructor(
		@Inject('IWorkflowRepository') private readonly workflowRepository: IWorkflowRepository,
		@Inject('IAccountPackageRepository') private readonly accountPackageRepository: IAccountPackageRepository,
		@Inject('IPackageLinkRepository') private readonly packageLinkRepository: IPackageLinkRepository,
		private readonly driverConnectionRegistry: DriverConnectionRegistry,
	) {}

	/**
	 * @returns The sync's id — the driver answers `workflows:sync:result` with it.
	 * @throws OperationNotPermitted when the driver isn't the user's (or isn't connected).
	 */
	async execute(userId: string, driverId: string): Promise<string> {

		if (this.driverConnectionRegistry.getByDriverId(driverId)?.userId !== userId) throw new OperationNotPermitted;

		const connection = this.driverConnectionRegistry.getByDriverId(driverId);
		if (!connection) throw new DriverNotFound;

		const workflows = await this.workflowRepository.findAllByUser(userId);

		const allPackageIds = new Set<string>();
		for (const workflow of workflows) {
			allPackageIds.add(workflow.data.board.packageId);
			for (const component of workflow.data.components) {
				allPackageIds.add(component.packageId);
			}
		}

		const pkgResults = await Promise.all(
			[...allPackageIds].map(id => this.accountPackageRepository.findById(id)),
		);
		const pkgMap = new Map(
			[...allPackageIds].map((id, i) => [id, pkgResults[i]]),
		);

		// `board.packageId`/component `packageId` should always be an AccountPackage id, but
		// some workflows (created before this was fixed) may have a PackageLink id stored
		// instead — fall back to resolving through the link so those still sync correctly.
		const unresolvedIds = [...allPackageIds].filter(id => !pkgMap.get(id));
		if (unresolvedIds.length > 0) {
			const linkResults = await Promise.all(
				unresolvedIds.map(id => this.packageLinkRepository.findById(id)),
			);
			linkResults.forEach((link, i) => {
				if (link?.accountPackage) pkgMap.set(unresolvedIds[i]!, link.accountPackage);
			});
		}

		const workflowDTOs: DriverSyncWorkflowsInDTO['workflows'] = workflows.map(workflow => {

			const boardPkg = pkgMap.get(workflow.data.board.packageId);

			const packages: PackageDTO[] = [
				...(boardPkg?.pkg ? [{ name: boardPkg.pkg.spec, version: boardPkg.pkg.version, role: 'board' as const }] : []),
				{ name: PLATFORM_PACKAGE, version: workflow.platform, role: 'platform' as const },
				...[...new Set(workflow.data.components.map(c => c.packageId))]
					.map(id => pkgMap.get(id))
					.filter((p): p is NonNullable<typeof p> => p?.pkg != null)
					.map(p => ({ name: p.pkg!.spec, version: p.pkg!.version, role: 'component' as const })),
			];

			return { workflowId: workflow.id!, packages };

		});

		const id = randomUUID();
		this.driverConnectionRegistry.emit(driverId, 'workflows:sync', {
			id,
			workflows: workflowDTOs,
		} satisfies DriverSyncWorkflowsInDTO);
		return id;

	}

}
