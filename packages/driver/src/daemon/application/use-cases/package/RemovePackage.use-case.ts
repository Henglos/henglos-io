import type { DriverRemovePackageOutDTO } from "@henglosio/shared";
import { injectable } from "tsyringe";
import { PackageService } from "../../services/PackageService.js";
import { CommandContext } from "../../../domain/entities/CommandContext.js";

/** Removes a package version from the driver's cache. */
@injectable()
export class RemovePackageUseCase {

	constructor(
		private readonly packageService: PackageService,
	) {}

	async execute(name: string, version: string, ctx: CommandContext): Promise<DriverRemovePackageOutDTO> {

		const removed = await this.packageService.remove(name, version);

		if (!removed) {
			ctx.reply({ type: "data", data: `${name}@${version} not found in cache` });
			return { removed: false };
		}

		ctx.reply({ type: "data", data: `${name}@${version} removed` });
		return { removed: true };

	}

}
