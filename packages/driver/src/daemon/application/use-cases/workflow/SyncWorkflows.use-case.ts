import { inject, injectable } from "tsyringe";
import { type DriverSyncWorkflowsInDTO } from "@henglosio/shared";

import { WorkflowService } from "../../services/WorkflowService.service.js";
import { IContainerRuntime } from "../../../domain/interfaces/IContainerRuntime.interface.js";
import { CommandContext } from "../../../domain/entities/CommandContext.js";
import { SyncWorkflowUseCase } from "./SyncWorkflow.use-case.js";

/**
 * Brings the driver up to date with every workflow of its user (on connect): drops the
 * workflows that are gone, syncs the rest.
 */
@injectable()
export class SyncWorkflowsUseCase {

	constructor(
		private readonly workflowService: WorkflowService,
		private readonly syncWorkflowUseCase: SyncWorkflowUseCase,
		@inject("IContainerRuntime") private readonly containerRuntime: IContainerRuntime,
	) {}

	async execute(workflows: DriverSyncWorkflowsInDTO['workflows'], ctx: CommandContext): Promise<boolean> {

		const incomingIds = new Set(workflows.map(w => w.workflowId));

		for (const local of await this.workflowService.list()) {
			if (!incomingIds.has(local.id)) {
				await this.workflowService.remove(local.id);
				await this.containerRuntime.removeContainer(`henglosio-${local.id}`);
			}
		}

		for (const { workflowId, packages } of workflows) {
			const result = await this.syncWorkflowUseCase.execute(workflowId, packages, ctx);
			if (!result) return false;
		}

		return true;

	}

}
