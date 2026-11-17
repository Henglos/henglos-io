import type { SyncPackage } from "@henglosio/shared";
import { injectable } from "tsyringe";

import { type PackageMetadata, type WorkflowDependencies, WorkflowService } from "../../services/WorkflowService.service.js";
import { CachedPackage, PackageService } from "../../services/PackageService.service.js";
/** Where a sync reports what it does — a CommandContext, or a task's log (CompileWorkflowUseCase). */
export type SyncReporter = {
	reply(result: { type: "data"; data: string }): void;
	fail(error: string): void;
};
import { PlatformService } from "../../services/PlatformService.service.js";

const isSamePackage = (a: { name: string; version: string }, b: { name: string; version: string }) =>
	a.name === b.name && a.version === b.version;

/** Brings one workflow up to date: installs the packages it needs now, and records them. */
@injectable()
export class SyncWorkflowUseCase {

	constructor(
		private readonly workflowService: WorkflowService,
		private readonly packageService: PackageService,
	) {}

	async execute(workflowId: string, packages: SyncPackage[], ctx: SyncReporter): Promise<boolean> {

		// Awaited: getMetadata below needs the folder, and create's empty metadata
		// must not land after this sync's.
		if (!await this.workflowService.exists(workflowId)) {
			await this.workflowService.create(workflowId);
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
				const installedPkg = await this.packageService.install(pkg.name, pkg.version).catch(async (error: unknown) => {
					// Kept for whoever builds this workflow next, long after this sync.
					const reason = (error as { code?: string }).code === "E404" ? "not on the registry" : error instanceof Error ? error.message : String(error);
					await this.workflowService.saveMetadata(workflowId, { ...metadata, syncError: `${pkg.name}@${pkg.version}: ${reason}` });
					throw error;
				});
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
