import { Inject, Injectable } from "@nestjs/common";
import { ResolveBoardInstall, boardOptionScope, describeUnsupported, unsupportedNodes, type BoardOptionValue, type IWorkflowRuntime } from "@henglosio/workflow";
import { checkPlatformSettings, type BoardInstall } from "@henglosio/shared";

import type { IAccountPackageRepository } from "@/domain/repositories/IAccountPackageRepository.repo";
import type { IPackageLinkRepository } from "@/domain/repositories/IPackageLinkRepository.repo";
import type { IWorkflowFileRepository } from "@/domain/repositories/IWorkflowFileRepository.repo";
import type { IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { InvalidPlatformSettings, InvalidWorkflowFile, UnsupportedCapability } from "@/application/errors/Workflow.error";
import { PlatformNotFound } from "@/application/errors/services/Platform.error";
import { GetPlatformSettingsUseCase } from "../platform/GetPlatformSettings.use-case";
import { CredentialService } from "@/application/services/Credential.service";
import { createHash } from "crypto";

/**
 * What a session (Play, Run, Debug, Record) asks the driver to put on the
 * board before its first frame: the components' actions the workflow uses
 * (by package name@version — the driver has them cached) and the files its
 * configs reference, with their bytes, the values of the credentials they
 * pick (the user's — `userId`), and the limits the workflow overrides (checked
 * against its platform version — the runtime reads them at start, no build).
 * See ResolveBoardInstall and the driver's BoardInstaller.
 */
@Injectable()
export class BuildBoardInstall {

	private readonly resolve = new ResolveBoardInstall();

	constructor(
		@Inject("IAccountPackageRepository") private readonly accountPackageRepository: IAccountPackageRepository,
		@Inject("IPackageLinkRepository") private readonly packageLinkRepository: IPackageLinkRepository,
		@Inject("IWorkflowFileRepository") private readonly fileRepository: IWorkflowFileRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		private readonly getPlatformSettings: GetPlatformSettingsUseCase,
		private readonly credentials: CredentialService,
	) {}

	// A component's packageId is an AccountPackage id — or, on workflows
	// older than that, a PackageLink id (same fallback as UpdateWorkflow).
	private async spec(packageId: string): Promise<{ name: string; version: string } | null> {
		const direct = await this.accountPackageRepository.findById(packageId);
		const accountPackage = direct ?? (await this.packageLinkRepository.findById(packageId))?.accountPackage ?? null;
		return accountPackage ? { name: accountPackage.pkg.spec, version: accountPackage.pkg.version } : null;
	}

	/**
	 * @param workflow The workflow as it is now (the caller has flushed the live doc).
	 * @throws UnsupportedCapability when a node needs what the board doesn't have;
	 *   InvalidWorkflowFile when an attached file is gone; CredentialMissing;
 *   InvalidPlatformSettings when a limit override isn't allowed.
	 */
	async execute(userId: string, workflowId: string, workflow: IWorkflowRuntime): Promise<BoardInstall> {

		// Nothing goes on a board that can't run it: a node needing wifi on one
		// without — before a byte is sent.
		const unsupported = unsupportedNodes(workflow);
		if (unsupported.length) throw new UnsupportedCapability(describeUnsupported(workflow, unsupported));

		const needed = this.resolve.execute(workflow);

		const components: BoardInstall["components"] = [];
		for (const component of needed.components) {
			const spec = await this.spec(component.packageId);
			// A package gone from the account: its actions can't run anyway —
			// the board answers ACTION_NOT_FOUND, which the session reports.
			if (!spec) continue;
			components.push({
				...spec,
				module: component.module,
				actions: component.actions.map(action => ({ module: action.module, script: action.script })),
			});
		}

		const files: BoardInstall["files"] = [];
		for (const file of needed.files) {
			const stored = await this.fileRepository.findById(workflowId, file.fileId);
			if (!stored) throw new InvalidWorkflowFile(`An attached file is missing (${file.path}) — attach it again`);
			files.push({ path: file.path, sha256: stored.sha256, data: new Uint8Array(stored.data) });
		}

		// The credentials picked — their values, as JSON, to where the configs
		// point (/secrets/<id>.json). The driver removes them once unused.
		for (const credential of needed.credentials) {
			const data = new TextEncoder().encode(JSON.stringify(await this.credentials.values(userId, credential.credentialId)));
			files.push({ path: credential.path, sha256: createHash("sha256").update(data).digest("hex"), data });
		}

		return { components, files, settings: await this.settings(workflowId, workflow), options: runtimeOptions(workflow) };

	}

	// The workflow's limit overrides its platform version declares, checked —
	// out of range or a broken rule fails the session before a byte is sent.
	// Undefined when the version can't be read: the board's file stays as it is.
	private async settings(workflowId: string, workflow: IWorkflowRuntime): Promise<Record<string, number> | undefined> {
		const stored = await this.workflowRepository.findById(workflowId);
		if (!stored) return undefined;

		let declared;
		try {
			declared = await this.getPlatformSettings.execute(stored.platform);
		} catch (error) {
			if (error instanceof PlatformNotFound) return undefined;
			throw error;
		}

		const overrides: Record<string, unknown> = workflow.platformSettings ?? {};
		const problem = Object.values(checkPlatformSettings(declared.settings, declared.rules, overrides))[0];
		if (problem) throw new InvalidPlatformSettings(problem);

		// Only what this version declares (a workflow moved from another may
		// carry keys it doesn't have) — the runtime would ignore the rest anyway.
		return Object.fromEntries(declared.settings
			.filter(setting => typeof overrides[setting.key] === "number")
			.map(setting => [setting.key, overrides[setting.key] as number]));
	}

}

// The board's options with `scope: runtime`: what the workflow picked, or the
// default. They go to the board with the session — changing one needs no build.
function runtimeOptions(workflow: IWorkflowRuntime): Record<string, BoardOptionValue> {
	const picked = workflow.boardOptions ?? {};
	return Object.fromEntries((workflow.board.base.options ?? [])
		.filter(option => boardOptionScope(option) === "runtime")
		.map(option => [option.key, picked[option.key] ?? option.default]));
}
