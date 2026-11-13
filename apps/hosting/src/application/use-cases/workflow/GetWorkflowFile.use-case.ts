import { Inject, Injectable } from "@nestjs/common";

import { WorkflowFileNotFound, WorkflowNotFound } from "@/application/errors/Workflow.error";
import { OperationNotPermitted } from "@/application/errors/Auth.error";
import type { WorkflowFile } from "@/domain/entities/WorkflowFile";
import type { IWorkflowFileRepository } from "@/domain/repositories/IWorkflowFileRepository.repo";
import type { IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";

/** A stored file, with its bytes — only for the workflow's owner. */
@Injectable()
export class GetWorkflowFileUseCase {

	constructor(
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		@Inject("IWorkflowFileRepository") private readonly fileRepository: IWorkflowFileRepository,
	) {}

	/** A stored file, with its bytes. @throws WorkflowNotFound, OperationNotPermitted, WorkflowFileNotFound. */
	async execute(userId: string, workflowId: string, fileId: string): Promise<WorkflowFile> {
		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow) throw new WorkflowNotFound;
		if (workflow.userId !== userId) throw new OperationNotPermitted;
		const file = await this.fileRepository.findById(workflowId, fileId);
		if (!file) throw new WorkflowFileNotFound;
		return file;
	}

}
