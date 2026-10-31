import { injectable } from "tsyringe";
import {
	type TaskCompilePayload,
	type TaskExecutePayload,
	type TaskFlashPayload,
	type TaskRecordPayload,
	type TaskReplPayload,
	type TaskFsPayload,
	type TaskType,
	TaskFsPayloadSchema,
	TaskCompilePayloadSchema,
	TaskExecutePayloadSchema,
	TaskFlashPayloadSchema,
	TaskRecordPayloadSchema,
	TaskReplPayloadSchema,
} from "@henglosio/shared";

import type { ITaskCommand } from "../../domain/interfaces/ICommand.interface.js";
import { TaskContext } from "../../domain/entities/TaskContext.js";
import { CompileWorkflowUseCase } from "../use-cases/workflow/CompileWorkflow.use-case.js";
import { FlashWorkflowUseCase } from "../use-cases/workflow/FlashWorkflow.use-case.js";
import { ExecuteWorkflowUseCase } from "../use-cases/workflow/ExecuteWorkflow.use-case.js";
import { RecordWorkflowUseCase } from "../use-cases/workflow/RecordWorkflow.use-case.js";
import { ReplTerminalUseCase } from "../use-cases/repl/ReplTerminal.use-case.js";
import { BoardFilesUseCase } from "../use-cases/fs/BoardFiles.use-case.js";
import { WorkflowStateService } from "../services/WorkflowStateService.js";

/** The `compile` task: builds the workflow in its container. Locks the workflow — one build of it at a time. */
@injectable()
export class CompileTaskCommand implements ITaskCommand<TaskCompilePayload> {
	readonly type: TaskType = "compile";
	constructor(private readonly useCase: CompileWorkflowUseCase) {}
	isValidPayload(p: unknown): p is TaskCompilePayload { return TaskCompilePayloadSchema.safeParse(p).success; }
	locks(p: TaskCompilePayload): string[] { return [`workflow:${p.workflowId}`]; }
	execute(p: TaskCompilePayload, ctx: TaskContext) { return this.useCase.execute(p.workflowId, ctx, p.settings ?? {}); }
}

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
		return compiled ? [`port:${p.port}`] : [`workflow:${p.workflowId}`, `port:${p.port}`];
	}

	execute(p: TaskFlashPayload, ctx: TaskContext) { return this.useCase.execute(p.workflowId, p.port, p.baudrate, ctx); }
}

/**
 * The `execute` task (Play, ▶ run, debug): runs frames on the board, sent one by one by the
 * hosting's graph walker (continue / finish). Locks the board's port.
 */
@injectable()
export class ExecuteTaskCommand implements ITaskCommand<TaskExecutePayload> {
	readonly type: TaskType = "execute";
	constructor(private readonly useCase: ExecuteWorkflowUseCase) {}
	isValidPayload(p: unknown): p is TaskExecutePayload { return TaskExecutePayloadSchema.safeParse(p).success; }
	locks(p: TaskExecutePayload): string[] { return [`port:${p.port}`]; }
	execute(p: TaskExecutePayload, ctx: TaskContext) { return this.useCase.start(ctx.taskId, p.port, p.baudrate, p.frame, ctx, p.install); }

	/** Routed here from the gateway — hosting's graph walker drives these. */
	continue(taskId: string, frame: Uint8Array) { return this.useCase.continue(taskId, frame); }
	finish(taskId: string) { return this.useCase.finish(taskId); }
}

/** The `record` task: stores the workflow's whole frame sequence on the board. Locks the board's port. */
@injectable()
export class RecordTaskCommand implements ITaskCommand<TaskRecordPayload> {
	readonly type: TaskType = "record";
	constructor(private readonly useCase: RecordWorkflowUseCase) {}
	isValidPayload(p: unknown): p is TaskRecordPayload { return TaskRecordPayloadSchema.safeParse(p).success; }
	locks(p: TaskRecordPayload): string[] { return [`port:${p.port}`]; }
	execute(p: TaskRecordPayload, ctx: TaskContext) { return this.useCase.execute(p.port, p.baudrate, p.frames, ctx, p.install); }
}

/** The `repl` task: a terminal on the board's REPL, bytes both ways. Locks the board's port. */
@injectable()
export class ReplTaskCommand implements ITaskCommand<TaskReplPayload> {
	readonly type: TaskType = "repl";
	constructor(private readonly useCase: ReplTerminalUseCase) {}
	isValidPayload(p: unknown): p is TaskReplPayload { return TaskReplPayloadSchema.safeParse(p).success; }
	locks(p: TaskReplPayload): string[] { return [`port:${p.port}`]; }
	execute(p: TaskReplPayload, ctx: TaskContext) { return this.useCase.run(ctx.taskId, p.port, ctx); }

	/** Routed here from the gateway — what's typed in the studio's terminal. */
	write(taskId: string, data: Uint8Array) { this.useCase.write(taskId, data); }
}

/** The `fs` task: the board's files — list, read, write, delete, mkdir, rename. Locks the board's port. */
@injectable()
export class FsTaskCommand implements ITaskCommand<TaskFsPayload> {
	readonly type: TaskType = "fs";
	constructor(private readonly useCase: BoardFilesUseCase) {}
	isValidPayload(p: unknown): p is TaskFsPayload { return TaskFsPayloadSchema.safeParse(p).success; }
	locks(p: TaskFsPayload): string[] { return [`port:${p.port}`]; }
	execute(p: TaskFsPayload, ctx: TaskContext) {
		const path = p.path ?? "";
		switch (p.op) {
			case "list":   return this.useCase.list(p.port, ctx);
			case "read":   return this.useCase.read(p.port, path, ctx);
			case "write":  return this.useCase.write(p.port, path, new Uint8Array(p.data ?? []), ctx);
			case "delete": return this.useCase.remove(p.port, path, ctx);
			case "mkdir":  return this.useCase.mkdir(p.port, path, ctx);
			case "rename": return this.useCase.rename(p.port, path, p.to ?? "", ctx);
		}
	}
}

/** Every task command, by type — what TaskManager looks a `task:start` up in. */
@injectable()
export class TaskCommandRegistry {

	constructor(
		readonly compile: CompileTaskCommand,
		readonly flash: FlashTaskCommand,
		readonly execute: ExecuteTaskCommand,
		readonly record: RecordTaskCommand,
		readonly repl: ReplTaskCommand,
		readonly fs: FsTaskCommand,
	) {}

	get(type: TaskType): ITaskCommand {
		switch (type) {
			case "compile": return this.compile;
			case "flash":   return this.flash;
			case "execute": return this.execute;
			case "record":  return this.record;
			case "repl":    return this.repl;
			case "fs":      return this.fs;
		}
	}

}
