import { inject, injectable } from "tsyringe";
import { type DriverSyncWorkflowsInDTO } from "@henglosio/shared";

import { WorkflowService } from "../../services/WorkflowService.service.js";
import { IContainerRuntime } from "../../../domain/interfaces/IContainerRuntime.interface.js";
import { CommandContext } from "../../../domain/entities/CommandContext.js";
import { SyncWorkflowUseCase } from "./SyncWorkflow.use-case.js";
import { createLogger } from "../../../infrastructure/logger/Logger.js";

const log = createLogger("sync");

/**
 * Brings the driver up to date with every workflow of its user (on connect): drops the
 * workflows that are gone, syncs the rest — each on its own: one that fails (a
 * package not on the registry…) doesn't keep the others from syncing.
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

		let synced = true;
		for (const { workflowId, packages } of workflows) {
			try {
				if (!await this.syncWorkflowUseCase.execute(workflowId, packages, ctx)) synced = false;
			} catch (error) {
				synced = false;
				log.warn(`Couldn't sync workflow ${workflowId}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		return synced;

	}

}
