import { Inject, Injectable } from "@nestjs/common";
import { ResolveBoardInstall, describeUnsupported, unsupportedNodes, type IWorkflowRuntime } from "@henglosio/workflow";
import type { BoardInstall } from "@henglosio/shared";

import type { IAccountPackageRepository } from "@/domain/repositories/IAccountPackageRepository.repo";
import type { IPackageLinkRepository } from "@/domain/repositories/IPackageLinkRepository.repo";
import type { IWorkflowFileRepository } from "@/domain/repositories/IWorkflowFileRepository.repo";
import { InvalidWorkflowFile, UnsupportedCapability } from "@/application/errors/Workflow.error";
import { CredentialService } from "@/application/services/Credential.service";
import { createHash } from "crypto";

/**
 * What a session (Play, Run, Debug, Record) asks the driver to put on the
 * board before its first frame: the components' actions the workflow uses
 * (by package name@version — the driver has them cached) and the files its
 * configs reference, with their bytes, and the values of the credentials
 * they pick (the user's — `userId`). See ResolveBoardInstall and the driver's
 * BoardInstaller.
 */
@Injectable()
export class BuildBoardInstall {

	private readonly resolve = new ResolveBoardInstall();

	constructor(
		@Inject("IAccountPackageRepository") private readonly accountPackageRepository: IAccountPackageRepository,
		@Inject("IPackageLinkRepository") private readonly packageLinkRepository: IPackageLinkRepository,
		@Inject("IWorkflowFileRepository") private readonly fileRepository: IWorkflowFileRepository,
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
	 *   InvalidWorkflowFile when an attached file is gone; CredentialMissing.
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

		return { components, files };

	}

}
