import fs from "fs/promises";
import path from "path";
import { IContainerRuntime } from "@/daemon/domain/interfaces/IContainerRuntime.interface.js";
import { inject, injectable } from "tsyringe";
import { WorkflowService } from "./WorkflowService.service.js";

/**
 * Whether a workflow is compiled — its build container exists and was made for the board and
 * platform it has now.
 */
@injectable()
export class WorkflowStateService {

	constructor(
		@inject("IContainerRuntime") private readonly containerService: IContainerRuntime,
		private readonly workflowService: WorkflowService

	) {}

	// Compiled = its build container matches the workflow's board and platform,
	// and the runtime it built is on disk, ready to install — a firmware with
	// it frozen in (firmware.json), or its .mpy files (hio/). Components don't
	// count: sessions install them (BoardInstaller).
	async isCompiled(workflowId: string): Promise<boolean> {

		if (!await this.workflowService.exists(workflowId)) return false;
		const metadata = await this.workflowService.getMetadata(workflowId);
		if (!metadata.board || !metadata.platform) return false;
		const containerName = `henglosio-${workflowId}`;
		if (!await this.containerService.containerExists(containerName)) return false;
		const hash = this.workflowService.computePackagesHash(metadata.board, metadata.platform);
		const existingHash = await this.containerService.getContainerLabel(containerName, "henglosio.packages-hash");
		if (existingHash !== hash) return false;
		const build = this.workflowService.buildPath(workflowId);
		if (await fs.stat(path.join(build, "firmware.json")).then(s => s.isFile(), () => false)) return true;
		return fs.stat(path.join(build, "hio")).then(s => s.isDirectory(), () => false);

	}

}
