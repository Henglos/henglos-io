import { injectable } from "tsyringe";
import { type TaskFlashPayload, type TaskType, TaskFlashPayloadSchema } from "@henglosio/shared";

import type { ITaskCommand } from "../../domain/interfaces/ICommand.interface.js";
import { TaskContext } from "../../domain/entities/TaskContext.js";
import { FlashWorkflowUseCase } from "../use-cases/workflow/FlashWorkflow.use-case.js";
import { WorkflowStateService } from "../services/WorkflowStateService.service.js";

/** The `flash` task: writes the board's firmware. */
@injectable()
export class FlashTaskCommand implements ITaskCommand<TaskFlashPayload> {
	readonly type: TaskType = "flash";
	constructor(
		private readonly useCase: FlashWorkflowUseCase,
		private readonly workflowState: WorkflowStateService,
	) {}
	isValidPayload(p: unknown): p is TaskFlashPayload { return TaskFlashPayloadSchema.safeParse(p).success; }

	// Only hold the per-workflow build-container lock while the workflow isn't
	// compiled yet (or is being recompiled right now, which holds this same
	// key) — that's what "can't flash while compiling" actually needs. Once
	// compiled, flashes of the same workflow on different ports don't need to
	// wait on each other, just on the port they share.
	async locks(p: TaskFlashPayload): Promise<string[]> {
		const compiled = await this.workflowState.isCompiled(p.workflowId);
		return compiled ? [`port:${p.target.port}`] : [`workflow:${p.workflowId}`, `port:${p.target.port}`];
	}

	execute(p: TaskFlashPayload, ctx: TaskContext) { return this.useCase.execute(p.workflowId, p.target, ctx); }
}
