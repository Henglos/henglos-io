import { UserNotFound } from '@/application/errors/User.error';
import { PackageNotFound } from '@/application/errors/services/Package.error';
import { OperationNotPermitted } from '@/application/errors/Auth.error';
import { type IUserRepository } from '@/domain/repositories/IUserRepository.repo';
import { type IAccountPackageRepository } from '@/domain/repositories/IAccountPackageRepository.repo';
import { Inject, Injectable } from '@nestjs/common';

/** One package of the user's library — their install, and the package version. */
@Injectable()
export class GetPackageUseCase {
	constructor(
		@Inject('IUserRepository') private readonly userRepository: IUserRepository,
		@Inject('IAccountPackageRepository') private readonly accountPackageRepository: IAccountPackageRepository,
	) {}

	/** @throws UserNotFound; PackageNotFound; OperationNotPermitted when it isn't the user's. */
	async execute(userId: string, accountPackageId: string) {
		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound();

		const accountPkg = await this.accountPackageRepository.findById(accountPackageId);
		if (!accountPkg) throw new PackageNotFound();
		if (accountPkg.userId !== userId) throw new OperationNotPermitted();

		return { accountPackage: accountPkg, package: accountPkg.pkg };
	}
}
