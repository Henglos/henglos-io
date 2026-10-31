import { Injectable } from "@nestjs/common";
import { PlatformService } from "@/application/services/Platform.service";

/** The platform versions available — what a workflow can build with. */
@Injectable()
export class ListPlatformsUseCase {

	constructor(private readonly platformService: PlatformService) {}

	async execute(): Promise<string[]> {
		return this.platformService.list();
	}
}
