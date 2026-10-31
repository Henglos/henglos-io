import { Module, Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RegistryPlatformRepository } from "./RegistryPlatformRepository.impl";
import type { Env } from "@/config/env.schema";

/** Where the platform's releases come from: the npm registry at HIO_REGISTRY_URL. */
const platformProvider: Provider = {
	provide: "IPlatformRepository",
	inject: [ConfigService],
	useFactory: (config: ConfigService<Env, true>) => new RegistryPlatformRepository(
		config.get("HIO_REGISTRY_URL", { infer: true }),
	),
};

/** Provides "IPlatformRepository" — see platformProvider. */
@Module({
	providers: [platformProvider],
	exports: ["IPlatformRepository"],
})
export class PlatformModule {}
