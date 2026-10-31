import { UserNotFound } from '@/application/errors/User.error';
import { PlatformService } from '@/application/services/Platform.service';
import { type IUserRepository } from '@/domain/repositories/IUserRepository.repo';
import { type IPackageRepository } from '@/domain/repositories/IPackageRepository.repo';
import { type IAccountPackageRepository } from '@/domain/repositories/IAccountPackageRepository.repo';
import { PackageRegistryService } from '@/application/services/PackageRegistry.service';
import { Inject, Injectable } from '@nestjs/common';
import {
	PackageAlreadyExists,
	IncompatiblePlatformVersion,
} from '@/application/errors/services/Package.error';
import semver from 'semver';
import { AccountPackage } from '@/domain/entities/AccountPackage';
import { TelemetryService, packageName } from "@/application/services/Telemetry.service";

/**
 * Installs a package version into the user's library: reads it from its
 * registry, stores the version (once — every user shares it) and adds it to
 * the account.
 */
@Injectable()
export class AddPackageUseCase {

	constructor(
		@Inject('IUserRepository')
		private readonly userRepository: IUserRepository,

		@Inject('IPackageRepository')
		private readonly packageRepository: IPackageRepository,

		@Inject('IAccountPackageRepository')
		private readonly accountPackageRepository: IAccountPackageRepository,

		private readonly registryService: PackageRegistryService,
		private readonly platformService: PlatformService,
		private readonly telemetry: TelemetryService,
	) {}

	/**
	 * @param spec An npm spec — `name@version`, or a name for the latest.
	 * @param registry Its registry (HIO_REGISTRY_URL by default).
	 * @param token To read it, for a private package — kept with the install.
	 * @throws UserNotFound; the registry's errors (see PackageRegistryService.fetchPackage);
	 *   IncompatiblePlatformVersion; PackageAlreadyExists when the user has that version.
	 */
	async execute(
		userId: string,
		spec: string,
		registry?: string,
		token?: string,
	) {
		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound();

		const resolvedRegistry = this.registryService.resolveRegistryUrl(registry);

		const pkg = await this.registryService.fetchPackage(
			spec,
			resolvedRegistry,
			token,
		);

		if (pkg.schema && 'platform' in (pkg.schema as any)) {
			const platform = (pkg.schema as any).platform as string | undefined;
			if (platform) {
				if (!semver.validRange(platform))
					throw new IncompatiblePlatformVersion;
				const compatible =
					await this.platformService.hasVersion(platform);
				if (!compatible) throw new IncompatiblePlatformVersion;
			}
		}

		let savedPackage = await this.packageRepository.findByNameVersion(
			pkg.spec,
			pkg.version,
		);
		if (!savedPackage) {
			savedPackage = await this.packageRepository.save(pkg);
		}

		const existing = await this.accountPackageRepository.findByUserPackage(
			userId,
			savedPackage.id!,
		);
		if (existing) throw new PackageAlreadyExists();

		const accountPkg = AccountPackage.create({ userId, pkg: savedPackage, token });
		const savedAccountPkg =
			await this.accountPackageRepository.save(accountPkg);

		const name = packageName(savedPackage.spec);
		this.telemetry.capture("package_added", { package: name, version: name === "third-party" ? null : savedPackage.version, kind: savedPackage.type });

		return savedAccountPkg;
	}
}
