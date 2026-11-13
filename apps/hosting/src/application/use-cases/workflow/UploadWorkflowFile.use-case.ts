import { createHash } from "crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { IFileValueSchema } from "@henglosio/workflow";

import { InvalidWorkflowFile, WorkflowNotFound } from "@/application/errors/Workflow.error";
import { OperationNotPermitted } from "@/application/errors/Auth.error";
import { WORKFLOW_FILE_MAX_BYTES, type WorkflowFile } from "@/domain/entities/WorkflowFile";
import type { IWorkflowFileRepository } from "@/domain/repositories/IWorkflowFileRepository.repo";
import type { IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";

/** A stored file as a `type: file` config's value — what the studio sets on the config. */
const toFileValue = (file: WorkflowFile): IFileValueSchema => ({
	fileId: file.id,
	name: file.name,
	size: file.size,
	mime: file.mime,
	sha256: file.sha256,
});

/**
 * A file attached to a workflow's config: the studio uploads one, then sets the
 * returned value on the config (update:configuration). Only the workflow's owner
 * reaches it.
 */
@Injectable()
export class UploadWorkflowFileUseCase {

	constructor(
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		@Inject("IWorkflowFileRepository") private readonly fileRepository: IWorkflowFileRepository,
	) {}

	/**
	 * Stores a file — the same content uploaded twice is stored once.
	 *
	 * @returns The value to set on the config.
	 * @throws WorkflowNotFound, OperationNotPermitted; InvalidWorkflowFile when
	 *   it's empty or bigger than WORKFLOW_FILE_MAX_BYTES.
	 */
	async execute(userId: string, workflowId: string, file: { name: string; mime: string; data: Buffer }): Promise<IFileValueSchema> {
		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow) throw new WorkflowNotFound;
		if (workflow.userId !== userId) throw new OperationNotPermitted;
		if (file.data.length === 0) throw new InvalidWorkflowFile("The file is empty");
		if (file.data.length > WORKFLOW_FILE_MAX_BYTES) {
			throw new InvalidWorkflowFile(`The file has ${file.data.length} bytes — at most ${WORKFLOW_FILE_MAX_BYTES} fit`);
		}

		const stored = await this.fileRepository.save({
			workflowId,
			name: file.name.slice(0, 255) || "file",
			mime: file.mime.slice(0, 127) || "application/octet-stream",
			size: file.data.length,
			sha256: createHash("sha256").update(file.data).digest("hex"),
			data: file.data,
		});
		return toFileValue(stored);
	}

}
