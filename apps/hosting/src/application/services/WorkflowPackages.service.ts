import { Inject, Injectable } from "@nestjs/common";
import { PLATFORM_PACKAGE, type SyncPackage } from "@henglosio/shared";

import type { Workflow } from "@/domain/entities/Workflow";
import type { AccountPackage } from "@/domain/entities/AccountPackage";
import { type IAccountPackageRepository } from "@/domain/repositories/IAccountPackageRepository.repo";
import { type IPackageLinkRepository } from "@/domain/repositories/IPackageLinkRepository.repo";

/**
 * The packages a workflow needs on a driver — its board, the platform at its
 * version, and its components — as a driver syncs them (`workflow:sync`, and a
 * compile's payload).
 */
@Injectable()
export class WorkflowPackagesService {

	constructor(
		@Inject("IAccountPackageRepository") private readonly accountPackageRepository: IAccountPackageRepository,
		@Inject("IPackageLinkRepository") private readonly packageLinkRepository: IPackageLinkRepository,
	) {}

	async packagesOf(workflow: Workflow): Promise<SyncPackage[]> {

		const componentIds = [...new Set(workflow.data.components.map(component => component.packageId))];
		const [board, ...components] = await Promise.all([
			this.resolve(workflow.data.board.packageId),
			...componentIds.map(id => this.resolve(id)),
		]);

		return [
			...(board ? [{ name: board.pkg.spec, version: board.pkg.version, role: "board" as const }] : []),
			{ name: PLATFORM_PACKAGE, version: workflow.platform, role: "platform" as const },
			...components
				.filter((component): component is AccountPackage => !!component)
				.map(component => ({ name: component.pkg.spec, version: component.pkg.version, role: "component" as const })),
		];

	}

	// A workflow's package id is an account package's — or, in a workflow made
	// before that was fixed, a package link's.
	private async resolve(id: string): Promise<AccountPackage | null> {
		const direct = await this.accountPackageRepository.findById(id);
		if (direct) return direct;
		const link = await this.packageLinkRepository.findById(id);
		return link?.accountPackage ?? null;
	}

}
