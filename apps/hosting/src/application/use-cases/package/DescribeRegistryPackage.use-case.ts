import { Inject, Injectable } from '@nestjs/common';
import type { RegistryPackageOut } from '@henglosio/shared';

import { UserNotFound } from '@/application/errors/User.error';
import { type IUserRepository } from '@/domain/repositories/IUserRepository.repo';
import { type IAccountPackageRepository } from '@/domain/repositories/IAccountPackageRepository.repo';
import { PackageRegistryService } from '@/application/services/PackageRegistry.service';

/**
 * A package on the registry, by name — what the Library's Add package shows
 * before installing: every version, newest first, the one "latest" points
 * at, and which of them the account already has.
 */
@Injectable()
export class DescribeRegistryPackageUseCase {

	constructor(
		@Inject('IUserRepository') private readonly userRepository: IUserRepository,
		@Inject('IAccountPackageRepository') private readonly accountPackageRepository: IAccountPackageRepository,
		private readonly registryService: PackageRegistryService,
	) {}

	/** @throws UserNotFound; RegistryPackageNotFound when the registry has no such package. */
	async execute(userId: string, name: string, registry?: string, token?: string): Promise<RegistryPackageOut> {

		if (!await this.userRepository.findById(userId)) throw new UserNotFound();

		const found = await this.registryService.describePackage(name.trim(), this.registryService.resolveRegistryUrl(registry), token);

		const installed = new Set(
			(await this.accountPackageRepository.findAllByUser(userId))
				.filter(accountPackage => accountPackage.pkg.spec === found.name)
				.map(accountPackage => accountPackage.pkg.version),
		);

		return {
			...found,
			versions: found.versions.map(version => ({ ...version, installed: installed.has(version.version) })),
		};

	}

}
