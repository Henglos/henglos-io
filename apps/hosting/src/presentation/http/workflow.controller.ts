import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Put,
	Query,
	Res,
	StreamableFile,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { AuthUser } from '@/infrastructure/http/decorators/AuthUser.decorator';
import { AuthGuard } from '@/infrastructure/http/guards/Auth.guard';
import { ZodValidationPipe } from '@/infrastructure/http/pipes/ZodValidation.pipe';

import { CreateWorkflowUseCase } from '@/application/use-cases/workflow/CreateWorkflow.use-case';
import { DeleteWorkflowUseCase } from '@/application/use-cases/workflow/DeleteWorkflow.use-case';
import { ListWorkflowsUseCase } from '@/application/use-cases/workflow/ListWorkflow.use-case';
import { UpdateWorkflowUseCase } from '@/application/use-cases/workflow/UpdateWorkflow.use-case';
import { GetWorkflowUseCase } from '@/application/use-cases/workflow/GetWorkflow.use-case';
import { ExportWorkflowUseCase } from '@/application/use-cases/workflow/ExportWorkflow.use-case';
import { ImportWorkflowUseCase } from '@/application/use-cases/workflow/ImportWorkflow.use-case';
import { WorkflowFilesUseCase } from '@/application/use-cases/workflow/WorkflowFiles.use-case';
import { InvalidWorkflowArchive, InvalidWorkflowFile } from '@/application/errors/Workflow.error';
import { WORKFLOW_FILE_MAX_BYTES } from '@/domain/entities/WorkflowFile';
import type { IFileValueSchema } from '@henglosio/workflow';

import { MinimalUser } from '@/domain/entities/AuthUser';
import {
	CreateWorkflowInSchema,
	UpdateWorkflowInSchema,
	type CreateWorkflowIn,
	type CreateWorkflowOut,
	type DeleteWorkflowOut,
	type ListWorkflowsOut,
	type UpdateWorkflowIn,
	type UpdateWorkflowOut,
	type ImportWorkflowOut,
	HIO_MAX_BYTES,
} from '@henglosio/shared';

/** /io/api/v1/workflows — the user's workflows: create, read, change, delete, export and import them. */
@Controller('workflows')
export class WorkflowController {
	constructor(
		private readonly createWorkflowUseCase: CreateWorkflowUseCase,
		private readonly getWorkflowUseCase: GetWorkflowUseCase,
		private readonly listWorkflowsUseCase: ListWorkflowsUseCase,
		private readonly deleteWorkflowUseCase: DeleteWorkflowUseCase,
		private readonly updateWorkflowUseCase: UpdateWorkflowUseCase,
		private readonly exportWorkflowUseCase: ExportWorkflowUseCase,
		private readonly importWorkflowUseCase: ImportWorkflowUseCase,
		private readonly workflowFilesUseCase: WorkflowFilesUseCase,
	) {}

	/** GET /workflows/:workflowId/export — the workflow as a .hio (see @henglosio/shared's hio.ts), as a download. */
	@Get(':workflowId/export')
	@UseGuards(AuthGuard)
	async exportWorkflow(
		@AuthUser() minimalUser: MinimalUser,
		@Param('workflowId') workflowId: string,
		@Res({ passthrough: true }) res: Response,
	): Promise<StreamableFile> {
		const { fileName, archive } = await this.exportWorkflowUseCase.execute(minimalUser.userId, workflowId);
		res.set({
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
			'Access-Control-Expose-Headers': 'Content-Disposition',
		});
		return new StreamableFile(archive);
	}

	/** POST /workflows/import — a .hio uploaded as multipart `file` becomes a new workflow of the account. */
	@Post('import')
	@UseGuards(AuthGuard)
	@UseInterceptors(FileInterceptor('file', { limits: { fileSize: HIO_MAX_BYTES, files: 1 } }))
	async importWorkflow(
		@AuthUser() minimalUser: MinimalUser,
		@UploadedFile() file: Express.Multer.File | undefined,
	): Promise<ImportWorkflowOut> {
		if (!file?.buffer) throw new InvalidWorkflowArchive('No file uploaded');
		return this.importWorkflowUseCase.execute(minimalUser.userId, file.buffer);
	}

	/**
	 * POST /workflows/:workflowId/files — a file for a `type: file` config,
	 * uploaded as multipart `file`. Answers with the value to set on the
	 * config (update:configuration).
	 */
	@Post(':workflowId/files')
	@UseGuards(AuthGuard)
	@UseInterceptors(FileInterceptor('file', { limits: { fileSize: WORKFLOW_FILE_MAX_BYTES, files: 1 } }))
	async uploadFile(
		@AuthUser() minimalUser: MinimalUser,
		@Param('workflowId') workflowId: string,
		@UploadedFile() file: Express.Multer.File | undefined,
	): Promise<IFileValueSchema> {
		if (!file?.buffer) throw new InvalidWorkflowFile('No file uploaded');
		return this.workflowFilesUseCase.upload(minimalUser.userId, workflowId, {
			// Multer reads the name as latin1 — back to the UTF-8 it was sent in.
			name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
			mime: file.mimetype,
			data: file.buffer,
		});
	}

	/** GET /workflows/:workflowId/files/:fileId — an attached file's bytes, with its type. */
	@Get(':workflowId/files/:fileId')
	@UseGuards(AuthGuard)
	async getFile(
		@AuthUser() minimalUser: MinimalUser,
		@Param('workflowId') workflowId: string,
		@Param('fileId') fileId: string,
		@Res({ passthrough: true }) res: Response,
	): Promise<StreamableFile> {
		const file = await this.workflowFilesUseCase.get(minimalUser.userId, workflowId, fileId);
		res.set({
			'Content-Type': file.mime,
			'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
		});
		return new StreamableFile(file.data);
	}

	/** POST /workflows — a new workflow on one of the user's boards (`name`, `description`, `boardId`, `platform?`). */
	@Post()
	@UseGuards(AuthGuard)
	async createWorkflow(
		@AuthUser() minimalUser: MinimalUser,
		@Body(new ZodValidationPipe(CreateWorkflowInSchema))
		body: CreateWorkflowIn,
	): Promise<CreateWorkflowOut> {
		const workflow = await this.createWorkflowUseCase.execute(
			minimalUser.userId,
			body.name,
			body.description,
			body.boardId,
			body.platform,
		);
		return { id: workflow.id! };
	}

	/** GET /workflows/:workflowId — the whole workflow, and whether its board is missing. */
	@Get(':workflowId')
	@UseGuards(AuthGuard)
	async getWorkflow(
		@AuthUser() minimalUser: MinimalUser,
		@Param('workflowId') workflowId: string,
	) {
		const { workflow, boardMissing } = await this.getWorkflowUseCase.execute(
			minimalUser.userId,
			workflowId,
		);
		return {
			workflow: {
				id: workflow.id!,
				name: workflow.data.name,
				description: workflow.data.description,
				createdAt: workflow.createdAt.toISOString(),
				updatedAt: workflow.updatedAt.toISOString(),
				platform: workflow.platform,
				data: workflow.data,
				boardMissing,
			},
		};
	}

	/** GET /workflows?query=&segment=&length= — a page of the user's workflows, as a summary each. */
	@Get()
	@UseGuards(AuthGuard)
	async listWorkflows(
		@AuthUser() minimalUser: MinimalUser,
		@Query('query') query?: string,
		@Query('segment') segment?: number,
		@Query('length') length?: number,
	): Promise<ListWorkflowsOut> {
		// Query params arrive as strings — `segment + 1` would concatenate.
		const workflowsSegment = await this.listWorkflowsUseCase.execute(
			minimalUser.userId,
			query ?? '',
			Number(segment ?? 0) || 0,
			Number(length ?? 10) || 10,
		);
		return {
			workflows: workflowsSegment.workflows.map(({ workflow, board }) => ({
				id: workflow.id!,
				name: workflow.data.name,
				description: workflow.data.description,
				createdAt: workflow.createdAt.toISOString(),
				updatedAt: workflow.updatedAt.toISOString(),
				// The board package's name; no package left — no board (see DeletePackage).
				board: board ?? "No board",
				components: workflow.data.components.length,
				actions: workflow.data.board.actions.length
					+ workflow.data.components.reduce((sum, component) => sum + component.actions.length, 0),
			})),
			nextSegment: workflowsSegment.nextSegment,
		};
	}

	/** PUT /workflows/:workflowId — the same as PATCH. */
	@Put(':workflowId')
	@UseGuards(AuthGuard)
	async updateWorkflow_(
		@AuthUser() minimalUser: MinimalUser,
		@Param('workflowId') workflowId: string,
		@Body(new ZodValidationPipe(UpdateWorkflowInSchema))
		updates: UpdateWorkflowIn,
	): Promise<UpdateWorkflowOut> {
		const workflow = await this.updateWorkflowUseCase.execute(
			minimalUser.userId,
			workflowId,
			updates,
		);
		return {
			workflow: {
				id: workflow.id!,
				name: workflow.data.name,
				description: workflow.data.description,
				createdAt: workflow.createdAt.toISOString(),
				updatedAt: workflow.updatedAt.toISOString(),
				platform: workflow.platform,
				data: workflow.data,
			},
		};
	}

	/** PATCH /workflows/:workflowId — applies a patch of operations (see UpdateWorkflowUseCase); answers the workflow after it. */
	@Patch(':workflowId')
	@UseGuards(AuthGuard)
	async updateWorkflow(
		@AuthUser() minimalUser: MinimalUser,
		@Param('workflowId') workflowId: string,
		@Body(new ZodValidationPipe(UpdateWorkflowInSchema))
		updates: UpdateWorkflowIn,
	): Promise<UpdateWorkflowOut> {
		const workflow = await this.updateWorkflowUseCase.execute(
			minimalUser.userId,
			workflowId,
			updates,
		);
		return {
			workflow: {
				id: workflow.id!,
				name: workflow.data.name,
				description: workflow.data.description,
				createdAt: workflow.createdAt.toISOString(),
				updatedAt: workflow.updatedAt.toISOString(),
				platform: workflow.platform,
				data: workflow.data,
			},
		};
	}

	/** DELETE /workflows/:workflowId — deletes it. */
	@Delete(':workflowId')
	@UseGuards(AuthGuard)
	async deleteWorkflow(
		@AuthUser() minimalUser: MinimalUser,
		@Param('workflowId') workflowId: string,
	): Promise<DeleteWorkflowOut> {
		await this.deleteWorkflowUseCase.execute(
			minimalUser.userId,
			workflowId,
		);
		return { status: 'deleted' };
	}
	
}
