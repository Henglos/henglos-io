import { UserNotFound } from '@/application/errors/User.error';
import { type IUserRepository } from '@/domain/repositories/IUserRepository.repo';
import {
	type IAccountPackageRepository,
	AccountPackageFilters,
} from '@/domain/repositories/IAccountPackageRepository.repo';
import { Inject, Injectable } from '@nestjs/common';

/** A package of the library, with every version of it the user installed. */
export type GroupedPackage = {
	/** Its name in the studio. */
	name: string;
	/** Its npm name. */
	packageName: string;
	author: string;
	description: string;
	type: 'board' | 'component';
	versions: { accountPackageId: string; version: string; platform: string }[];
};

/** The user's library: one entry per package, its installed versions grouped under it. */
@Injectable()
export class ListPackagesUseCase {
	constructor(
		@Inject('IUserRepository')
		private readonly userRepository: IUserRepository,
		@Inject('IAccountPackageRepository')
		private readonly accountPackageRepository: IAccountPackageRepository,
	) {}

	async execute(
		userId: string,
		filters?: AccountPackageFilters,
	): Promise<GroupedPackage[]> {
		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound();

		const packages = await this.accountPackageRepository.findAllByUser(
			userId,
			filters,
		);

		const grouped = new Map<string, GroupedPackage>();

		for (const pkg of packages) {
			const key = pkg.pkg.spec;
			const existing = grouped.get(key);
			if (existing) {
				existing.versions.push({
					accountPackageId: pkg.id!,
					version: pkg.pkg.version ?? '',
					platform: pkg.pkg.platform,
				});
			} else {
				grouped.set(key, {
					name: pkg.pkg.name ?? '',
					packageName: pkg.pkg.spec ?? '',
					author: pkg.pkg.author ?? '',
					description: pkg.pkg.description ?? '',
					type: pkg.pkg.type ?? 'board',
					versions: [
						{
							accountPackageId: pkg.id!,
							version: pkg.pkg.version ?? '',
							platform: pkg.pkg.platform,
						},
					],
				});
			}
		}

		return Array.from(grouped.values());
	}
}
