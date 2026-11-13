import { injectable } from "tsyringe";
import { type TaskCompilePayload, type TaskType, TaskCompilePayloadSchema } from "@henglosio/shared";

import type { ITaskCommand } from "../../domain/interfaces/ICommand.interface.js";
import { TaskContext } from "../../domain/entities/TaskContext.js";
import { CompileWorkflowUseCase } from "../use-cases/workflow/CompileWorkflow.use-case.js";

/** The `compile` task: builds the workflow in its container. Locks the workflow — one build of it at a time. */
@injectable()
export class CompileTaskCommand implements ITaskCommand<TaskCompilePayload> {
	readonly type: TaskType = "compile";
	constructor(private readonly useCase: CompileWorkflowUseCase) {}
	isValidPayload(p: unknown): p is TaskCompilePayload { return TaskCompilePayloadSchema.safeParse(p).success; }
	locks(p: TaskCompilePayload): string[] { return [`workflow:${p.workflowId}`]; }
	execute(p: TaskCompilePayload, ctx: TaskContext) { return this.useCase.execute(p.workflowId, ctx, p.settings ?? {}, p.options ?? {}); }
}
