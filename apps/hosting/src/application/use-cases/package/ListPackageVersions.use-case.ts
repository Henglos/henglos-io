import { Inject, Injectable } from '@nestjs/common';

import { UserNotFound } from '@/application/errors/User.error';
import { PackageNotFound } from '@/application/errors/services/Package.error';
import { OperationNotPermitted } from '@/application/errors/Auth.error';

import { type IUserRepository } from '@/domain/repositories/IUserRepository.repo';
import { type IAccountPackageRepository } from '@/domain/repositories/IAccountPackageRepository.repo';
import { PackageRegistryService } from '@/application/services/PackageRegistry.service';

/**
 * Every version its registry has of a package in the user's library — to
 * pick another one. Read from the registry it was installed from, with its token.
 */
@Injectable()
export class ListPackageVersionsUseCase {
	constructor(
		@Inject('IUserRepository') private readonly userRepository: IUserRepository,
		@Inject('IAccountPackageRepository') private readonly accountPackageRepository: IAccountPackageRepository,
		private readonly registryService: PackageRegistryService,
	) {}

	/** @throws UserNotFound; PackageNotFound; OperationNotPermitted when it isn't the user's. */
	async execute(userId: string, accountPackageId: string): Promise<string[]> {
		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound();

		const accountPkg = await this.accountPackageRepository.findById(accountPackageId);
		if (!accountPkg) throw new PackageNotFound();
		if (accountPkg.userId !== userId) throw new OperationNotPermitted();

		return this.registryService.listVersions(
			accountPkg.pkg.spec,
			accountPkg.pkg.registry,
			accountPkg.token ?? undefined,
		);
	}
}
