import type { SyncPackage } from "@henglosio/shared";

import { type PackageMetadata, type WorkflowDependencies, WorkflowService } from "../../services/WorkflowService.js";
import { CachedPackage, PackageService } from "../../services/PackageService.js";
import { CommandContext } from "../../../domain/entities/CommandContext.js";
import { injectable } from "tsyringe";

const isSamePackage = (a: { name: string; version: string }, b: { name: string; version: string }) =>
	a.name === b.name && a.version === b.version;

/** Brings one workflow up to date: installs the packages it needs now, and records them. */
@injectable()
export class SyncWorkflowUseCase {

	constructor(
		private readonly workflowService: WorkflowService,
		private readonly packageService: PackageService,
	) {}

	async execute(workflowId: string, packages: SyncPackage[], ctx: CommandContext): Promise<boolean> {

		if (!await this.workflowService.exists(workflowId)) {
			this.workflowService.create(workflowId);
		}

		// `packages` is the full desired state for this workflow (sent by hosting on every
		// sync), so the workflow's metadata is derived entirely from it: anything tracked
		// before that isn't in this list gets dropped from the metadata, but stays cached
		// on disk since other workflows may still depend on it.
		const metadata = await this.workflowService.getMetadata(workflowId);

		const resolvedPackages: CachedPackage[] = [];

		for (const pkg of packages) {

			const cachedPkg = await this.packageService.getPackage(pkg.name, pkg.version);

			if (!cachedPkg) {
				const installedPkg = await this.packageService.install(pkg.name, pkg.version);
				if (!installedPkg) {
					ctx.fail(`Package not find to install: ${pkg.name}@${pkg.version}`);
					throw new Error(`Package not find to install: ${pkg.name}@${pkg.version}`);
				}

				ctx.reply({ type: "data", data: `${installedPkg.name}@${installedPkg.version} installed and cached` });
				resolvedPackages.push(installedPkg);

			}else {

				ctx.reply({ type: "data", data: `${cachedPkg.name}@${cachedPkg.version} cached` });
				resolvedPackages.push(cachedPkg);

			}

		}

		const previouslyTracked: PackageMetadata[] = [
			...(metadata.board ? [metadata.board] : []),
			...(metadata.platform ? [metadata.platform] : []),
			...metadata.components,
		];
		const removedFromWorkflow = previouslyTracked.filter(
			tracked => !packages.some(pkg => isSamePackage(pkg, tracked)),
		);
		for (const removed of removedFromWorkflow) {
			ctx.reply({ type: "data", data: `${removed.name}@${removed.version} untracked from workflow (kept in cache)` });
		}

		const updatedMetadata: WorkflowDependencies = {
			board: resolvedPackages.find(pkg => pkg.type === "board") ?? null,
			platform: resolvedPackages.find(pkg => pkg.type === "platform") ?? null,
			components: resolvedPackages.filter(pkg => pkg.type === "component"),
		}

		await this.workflowService.saveMetadata(workflowId, updatedMetadata);

		ctx.reply({ type: "data", data: "Synced" });

		return true;
	}
}
