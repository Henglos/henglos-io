import { Module, Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import path from "node:path";
import { LocalPlatformRepository } from "./LocalPlatformRepository.impl";
import { RegistryPlatformRepository } from "./RegistryPlatformRepository.impl";
import type { Env } from "@/config/env.schema";

/**
 * Where the platform's releases come from: the npm registry at
 * HIO_REGISTRY_URL, plus the one in HIO_LOCAL_PACKAGES when it's set.
 */
const platformProvider: Provider = {
	provide: "IPlatformRepository",
	inject: [ConfigService],
	useFactory: (config: ConfigService<Env, true>) => {
		const registry = new RegistryPlatformRepository(config.get("HIO_REGISTRY_URL", { infer: true }));
		const local = config.get("HIO_LOCAL_PACKAGES", { infer: true });
		return local ? new LocalPlatformRepository(path.resolve(local, "hio-system"), registry) : registry;
	},
};

/** Provides "IPlatformRepository" — see platformProvider. */
@Module({
	providers: [platformProvider],
	exports: ["IPlatformRepository"],
})
export class PlatformModule {}
