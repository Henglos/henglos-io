import pacote from "pacote";
import type { IPlatformRepository } from "@/domain/repositories/IPlatformRepository.repo";
import { PlatformNotFound } from "@/application/errors/services/Platform.error";

import { PLATFORM_PACKAGE } from "@henglosio/shared";

const PACKAGE_NAME = PLATFORM_PACKAGE;

/**
 * The platform's releases: the published versions of @henglosio/hio-system on
 * an npm registry (npmjs, Gitea…) — the same place the drivers install
 * it from, so every version offered is one a driver can get.
 */
export class RegistryPlatformRepository implements IPlatformRepository {

	constructor(private readonly registry: string) {}

	/** The published versions — none when the registry doesn't answer. */
	async list(): Promise<string[]> {
		try {
			const packument = await pacote.packument(PACKAGE_NAME, { registry: this.registry });
			return Object.keys(packument.versions);
		} catch {
			return [];
		}
	}

	async fetch(version: string): Promise<Buffer> {
		try {
			return await pacote.tarball(`${PACKAGE_NAME}@${version}`, { registry: this.registry });
		} catch {
			throw new PlatformNotFound(version);
		}
	}
}
