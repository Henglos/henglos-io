import type { DriverDeleteWorkflowOutDTO } from "@henglosio/shared";
import { inject, injectable } from "tsyringe";
import { WorkflowService } from "../../services/WorkflowService.service.js";
import { IContainerRuntime } from "../../../domain/interfaces/IContainerRuntime.interface.js";
import { CommandContext } from "../../../domain/entities/CommandContext.js";

/** A workflow deleted in the studio: its build container and its folder go. */
@injectable()
export class DeleteWorkflowUseCase {

	constructor(
		@inject("IContainerRuntime") private readonly containerService: IContainerRuntime,
		private readonly workflowService: WorkflowService,
	) {}

	async execute(workflowId: string, ctx: CommandContext): Promise<DriverDeleteWorkflowOutDTO> {

		if (!await this.workflowService.exists(workflowId)) {

			ctx.reply({ type: "data", data: "Workflow not found" });
			return { deleted: false };

		}

		ctx.reply({ type: "data", data: "Deleting workflow..." });

		await this.containerService.removeContainer(`henglosio-${workflowId}`);
		await this.workflowService.remove(workflowId);

		ctx.reply({ type: "data", data: "Workflow deleted" });
		return { deleted: true };
	}

}
