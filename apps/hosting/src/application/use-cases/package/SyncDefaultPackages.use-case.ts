import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";

import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IAccountPackageRepository } from "@/domain/repositories/IAccountPackageRepository.repo";
import { type IDefaultPackageOfferRepository } from "@/domain/repositories/IDefaultPackageOfferRepository.repo";
import { PackageAlreadyExists } from "@/application/errors/services/Package.error";
import { AddPackageUseCase } from "@/application/use-cases/package/AddPackage.use-case";
import { DEFAULT_PACKAGES, type DefaultPackageEntry } from "@/config/default-packages";

// A spec's package name: `@scope/name@1.2.0` → `@scope/name`.
const packageNameOf = (spec: string) => spec.replace(/(?!^)@.*$/, "");

/**
 * Installs the default packages (config/default-packages.json) a user wasn't
 * offered yet — all of them for a new account (RegisterUser), and on every
 * start the ones an update added to the list.
 *
 * Each is offered once (IDefaultPackageOfferRepository): one the user already
 * has, any version, is only recorded; one they removed isn't installed again.
 * One that fails to install (its registry is down…) isn't recorded, so the
 * next start tries it again.
 */
@Injectable()
export class SyncDefaultPackagesUseCase implements OnApplicationBootstrap {

	private readonly logger = new Logger(SyncDefaultPackagesUseCase.name);

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IAccountPackageRepository") private readonly accountPackageRepository: IAccountPackageRepository,
		@Inject("IDefaultPackageOfferRepository") private readonly offerRepository: IDefaultPackageOfferRepository,
		private readonly addPackageUseCase: AddPackageUseCase,
	) {}

	// In the background: installing reads from the registry, the start doesn't wait for it.
	onApplicationBootstrap() {
		void this.syncAll().catch((error) => this.logger.error("Couldn't sync the default packages", error));
	}

	private async syncAll(): Promise<void> {
		for (const userId of await this.userRepository.findAllIds()) await this.execute(userId);
	}

	/** Installs the default packages the user wasn't offered yet. */
	async execute(userId: string): Promise<void> {

		const offered = new Set(await this.offerRepository.findNamesByUser(userId));
		const pending = DEFAULT_PACKAGES.filter((pkg) => !offered.has(packageNameOf(pkg.spec)));
		if (pending.length === 0) return;

		const library = new Set((await this.accountPackageRepository.findAllByUser(userId)).map((installed) => installed.pkg.spec));

		for (const pkg of pending) {
			const name = packageNameOf(pkg.spec);
			if (library.has(name) || await this.install(userId, pkg)) {
				await this.offerRepository.save(userId, name);
			}
		}

	}

	// Whether the user has it now.
	private async install(userId: string, pkg: DefaultPackageEntry): Promise<boolean> {
		try {
			await this.addPackageUseCase.execute(userId, pkg.spec, pkg.registry, pkg.token);
			this.logger.log(`Installed the default package ${pkg.name}`);
			return true;
		} catch (error) {
			if (error instanceof PackageAlreadyExists) return true;
			this.logger.warn(`Couldn't install the default package ${pkg.name} — trying again on the next start: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}

}
