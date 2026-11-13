import { DriverCreateWorkflowOutDTO, SyncPackage } from "@henglosio/shared";
import { WorkflowService } from "../../services/WorkflowService.service.js";
import type { WorkflowDependencies } from "../../services/WorkflowService.service.js";
import { CommandContext } from "../../../domain/entities/CommandContext.js";
import { CachedPackage, PackageService } from "../../services/PackageService.service.js";
import { injectable } from "tsyringe";

/** A workflow created in the studio: installs the packages it needs and keeps it here. */
@injectable()
export class CreateWorkflowUseCase {

	constructor(
		private readonly workflowService: WorkflowService,
		private readonly packageService: PackageService
	) {}

	async execute(workflowId: string, packages: SyncPackage[], ctx: CommandContext): Promise<DriverCreateWorkflowOutDTO> {

		if (await this.workflowService.exists(workflowId)) {
			ctx.reply({ type: "data", data: "Workflow already synced" });
			return { synced: true };
		}

		const resolved: CachedPackage[] = [];

		for (const pkg of packages) {
			let cached = await this.packageService.getPackage(pkg.name, pkg.version);

			if (!cached) {
				ctx.reply({ type: "data", data: `Installing ${pkg.name}@${pkg.version}...` });
				try {
					cached = await this.packageService.install(pkg.name, pkg.version);
				} catch {
					ctx.fail(`Failed to install package: ${pkg.name}@${pkg.version}`);
					return { synced: false };
				}
			}

			if (!cached) {
				ctx.fail(`Package not found: ${pkg.name}@${pkg.version}`);
				return { synced: false };
			}

			resolved.push(cached);
		}

		const dependencies: WorkflowDependencies = {
			board: null,
			platform: null,
			components: [],
		};

		for (let i = 0; i < packages.length; i++) {
			const { role } = packages[i];
			const cached = resolved[i];
			const meta = { name: cached.name, version: cached.version, path: cached.path };

			if (role === "board") dependencies.board = meta;
			else if (role === "platform") dependencies.platform = meta;
			else dependencies.components.push(meta);
		}

		await this.workflowService.create(workflowId);
		await this.workflowService.saveMetadata(workflowId, dependencies);

		return { synced: true };
	}

}
