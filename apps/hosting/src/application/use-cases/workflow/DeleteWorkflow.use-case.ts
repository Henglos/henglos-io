import { OperationNotPermitted } from "@/application/errors/Auth.error";
import { UserNotFound } from "@/application/errors/User.error";
import { WorkflowNotFound } from "@/application/errors/Workflow.error";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { DriverDeleteWorkflowInDTO } from "@henglosio/shared";
import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";

/**
 * Deletes a workflow — and tells the user's connected drivers, so they drop
 * what they kept for it (its build container).
 */
@Injectable()
export class DeleteWorkflowUseCase {

	constructor(
		private readonly driverConnectionRegistry: DriverConnectionRegistry,
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
	) {}

	/** @throws UserNotFound, WorkflowNotFound; OperationNotPermitted when it isn't the user's. */
	async execute(userId: string, workflowId: string) {

		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound;

		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow) throw new WorkflowNotFound;
		if (workflow.userId !== userId) throw new OperationNotPermitted;

		for (const driver of this.driverConnectionRegistry.getAllByUser(userId)) {

			this.driverConnectionRegistry.emit(driver.driverId, "workflow:delete", {
				id: randomUUID(),
				workflowId
			} as DriverDeleteWorkflowInDTO);

		}

		await this.workflowRepository.delete(workflowId);
	}

}
