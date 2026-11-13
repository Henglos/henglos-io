import semver from "semver";
import { Inject, Injectable } from "@nestjs/common";
import type { IPlatformRepository } from "@/domain/repositories/IPlatformRepository.repo";
import { PlatformNotFound } from "@/application/errors/services/Platform.error";

import { PLATFORM_PACKAGE } from "@henglosio/shared";

const PACKAGE_NAME = PLATFORM_PACKAGE;

/** The platform's releases — the versions of @henglosio/hio-system on the registry (see PlatformModule). */
@Injectable()
export class PlatformService {

	constructor(
		@Inject("IPlatformRepository")
		private readonly repository: IPlatformRepository,
	) {}

	/** The versions available. */
	async list(): Promise<string[]> {
		return this.repository.list();
	}

	/** Whether a release matches `version` — a version or a semver range. */
	async hasVersion(version: string): Promise<boolean> {
		const available = await this.repository.list();
		return available.some(v => semver.satisfies(v, version));
	}

	/** The published package of `version` (.tgz). */
	async fetch(version: string): Promise<Buffer> {
		return this.repository.fetch(version);
	}

	/**
	 * The npm spec to install the platform at `version` with.
	 *
	 * @throws PlatformNotFound when no release matches it.
	 */
	async getPackageSpec(version: string): Promise<{ name: string; version: string }> {
		if (!(await this.hasVersion(version))) {
			throw new PlatformNotFound(version);
		}
		return { name: PACKAGE_NAME, version };
	}

}
