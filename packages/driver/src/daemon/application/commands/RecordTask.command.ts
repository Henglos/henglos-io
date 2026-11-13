import { injectable } from "tsyringe";
import { type TaskRecordPayload, type TaskType, TaskRecordPayloadSchema } from "@henglosio/shared";

import type { ITaskCommand } from "../../domain/interfaces/ICommand.interface.js";
import { TaskContext } from "../../domain/entities/TaskContext.js";
import { RecordWorkflowUseCase } from "../use-cases/workflow/RecordWorkflow.use-case.js";

/** The `record` task: stores the workflow's whole frame sequence on the board. Locks the board's port. */
@injectable()
export class RecordTaskCommand implements ITaskCommand<TaskRecordPayload> {
	readonly type: TaskType = "record";
	constructor(private readonly useCase: RecordWorkflowUseCase) {}
	isValidPayload(p: unknown): p is TaskRecordPayload { return TaskRecordPayloadSchema.safeParse(p).success; }
	locks(p: TaskRecordPayload): string[] { return [`port:${p.port}`]; }
	execute(p: TaskRecordPayload, ctx: TaskContext) { return this.useCase.execute(p.port, p.baudrate, p.frames, ctx, p.install); }
}
