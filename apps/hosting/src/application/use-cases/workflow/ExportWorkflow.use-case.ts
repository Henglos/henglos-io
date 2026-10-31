import { Inject, Injectable } from "@nestjs/common";
import {
	HIO_EXTENSION,
	HIO_FILES_DIR,
	HIO_FORMAT,
	HIO_FORMAT_VERSION,
	HIO_MANIFEST_FILE,
	HIO_WORKFLOW_FILE,
	type HioManifest,
	type HioPackageRef,
} from "@henglosio/shared";

import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { type IAccountPackageRepository } from "@/domain/repositories/IAccountPackageRepository.repo";
import { type IPackageLinkRepository } from "@/domain/repositories/IPackageLinkRepository.repo";
import { WorkflowCollabService } from "@/application/services/WorkflowCollab.service";
import { UserNotFound } from "@/application/errors/User.error";
import { OperationNotPermitted } from "@/application/errors/Auth.error";
import { WorkflowNotFound } from "@/application/errors/Workflow.error";
import { PackageNotFound } from "@/application/errors/services/Package.error";
import { strToU8, zipSync } from "fflate";
import { isCoreComponent, workflowFileValues } from "@henglosio/workflow";
import { type IWorkflowFileRepository } from "@/domain/repositories/IWorkflowFileRepository.repo";
import { TelemetryService } from "@/application/services/Telemetry.service";

/**
 * A workflow to a .hio (see @henglosio/shared's hio.ts): its data, with the
 * account's package ids swapped for refs to the npm packages they are and the
 * board's and components' schemas left out — the import gets them back from
 * the packages themselves. Install tokens never leave the account.
 */
@Injectable()
export class ExportWorkflowUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		@Inject("IAccountPackageRepository") private readonly accountPackageRepository: IAccountPackageRepository,
		@Inject("IPackageLinkRepository") private readonly packageLinkRepository: IPackageLinkRepository,
		@Inject("IWorkflowFileRepository") private readonly fileRepository: IWorkflowFileRepository,
		private readonly collab: WorkflowCollabService,
		private readonly telemetry: TelemetryService,
	) {}

	/**
	 * @returns The .hio archive, and a file name for it.
	 * @throws WorkflowNotFound, or OperationNotPermitted when it isn't the user's.
	 */
	async execute(userId: string, workflowId: string): Promise<{ fileName: string; archive: Buffer }> {

		if (!await this.userRepository.existsById(userId)) throw new UserNotFound();

		// What's on screen, if it's open in the studio — see WorkflowCollabService.persistNow.
		await this.collab.persistNow(workflowId);
		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow) throw new WorkflowNotFound();
		if (workflow.userId !== userId) throw new OperationNotPermitted();

		const data = workflow.data;
		const packages: HioPackageRef[] = [];
		const refs = new Map<string, string>();

		const refOf = async (packageId: string, type: HioPackageRef["type"]): Promise<string> => {
			const known = refs.get(packageId);
			if (known) return known;
			const accountPackage = await this.resolveAccountPackage(packageId);
			if (!accountPackage) throw new PackageNotFound();
			const ref = type === "board" ? "board" : `component-${packages.length}`;
			packages.push({
				ref,
				type,
				spec: accountPackage.pkg.spec,
				version: accountPackage.pkg.version,
				...(accountPackage.pkg.registry && { registry: accountPackage.pkg.registry }),
			});
			refs.set(packageId, ref);
			return ref;
		};

		const boardRef = await refOf(data.board.packageId, "board");
		const components: (Omit<(typeof data.components)[number], "base">)[] = [];
		for (const component of data.components) {
			const { base: _schema, ...rest } = component;
			// Built-ins (Variables, Logic): no package — the id stays, the schema comes from the import's own copy.
			const packageId = isCoreComponent(component) ? component.packageId : await refOf(component.packageId, "component");
			components.push({ ...rest, packageId });
		}
		const { base: _boardSchema, ...board } = data.board;

		const portable = { ...data, board: { ...board, packageId: boardRef }, components };

		const manifest: HioManifest = {
			format: HIO_FORMAT,
			formatVersion: HIO_FORMAT_VERSION,
			exportedAt: new Date().toISOString(),
			name: data.name,
			description: data.description,
			platform: workflow.platform,
			packages,
		};

		// The files its configs point at, by content — the import stores them again.
		const attachments: Record<string, Uint8Array> = {};
		for (const value of workflowFileValues(data)) {
			const file = await this.fileRepository.findById(workflowId, value.fileId);
			if (file) attachments[`${HIO_FILES_DIR}${file.sha256}`] = new Uint8Array(file.data);
		}

		const archive = Buffer.from(zipSync({
			[HIO_MANIFEST_FILE]: strToU8(JSON.stringify(manifest, null, "\t")),
			[HIO_WORKFLOW_FILE]: strToU8(JSON.stringify(portable, null, "\t")),
			...attachments,
		}, { level: 9 }));

		this.telemetry.capture("workflow_exported");
		return { fileName: `${fileNameOf(data.name)}${HIO_EXTENSION}`, archive };

	}

	// Same fallback as UpdateWorkflow: older workflows may hold a PackageLink id.
	private async resolveAccountPackage(id: string) {
		const direct = await this.accountPackageRepository.findById(id);
		if (direct) return direct;
		const link = await this.packageLinkRepository.findById(id);
		return link?.accountPackage ?? null;
	}

}

// A name safe on every OS — the workflow's, without what a file name can't hold.
function fileNameOf(name: string): string {
	const cleaned = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
	return cleaned || "workflow";
}
