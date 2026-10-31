import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@/infrastructure/http/guards/Auth.guard";
import { ListPlatformsUseCase } from "@/application/use-cases/platform/ListPlatforms.use-case";
import { GetPlatformSettingsUseCase, type PlatformSettingsOut } from "@/application/use-cases/platform/GetPlatformSettings.use-case";
import type { ListPlatformsOut } from "@henglosio/shared";

/** /io/api/v1/platforms — the platform versions a workflow can build with. */
@Controller("platforms")
export class PlatformController {

	constructor(
		private readonly listPlatformsUseCase: ListPlatformsUseCase,
		private readonly getPlatformSettingsUseCase: GetPlatformSettingsUseCase,
	) {}

	/** GET /platforms — the versions available. */
	@Get()
	@UseGuards(AuthGuard)
	async list(): Promise<ListPlatformsOut> {
		const platforms = await this.listPlatformsUseCase.execute();
		return { platforms };
	}

	/** GET /platforms/:version/settings — what a workflow on this version can override (the studio's Platform settings). */
	@Get(":version/settings")
	@UseGuards(AuthGuard)
	async settings(@Param("version") version: string): Promise<PlatformSettingsOut> {
		return this.getPlatformSettingsUseCase.execute(version);
	}
}
