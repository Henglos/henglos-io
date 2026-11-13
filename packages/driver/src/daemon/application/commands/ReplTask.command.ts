import { injectable } from "tsyringe";
import { type TaskReplPayload, type TaskType, TaskReplPayloadSchema } from "@henglosio/shared";

import type { ITaskCommand } from "../../domain/interfaces/ICommand.interface.js";
import { TaskContext } from "../../domain/entities/TaskContext.js";
import { RunReplTerminalUseCase } from "../use-cases/repl/RunReplTerminal.use-case.js";
import { WriteReplTerminalUseCase } from "../use-cases/repl/WriteReplTerminal.use-case.js";

/** The `repl` task: a terminal on the board's REPL, bytes both ways. Locks the board's port. */
@injectable()
export class ReplTaskCommand implements ITaskCommand<TaskReplPayload> {
	readonly type: TaskType = "repl";
	constructor(
		private readonly runReplTerminal: RunReplTerminalUseCase,
		private readonly writeReplTerminal: WriteReplTerminalUseCase,
	) {}
	isValidPayload(p: unknown): p is TaskReplPayload { return TaskReplPayloadSchema.safeParse(p).success; }
	locks(p: TaskReplPayload): string[] { return [`port:${p.port}`]; }
	execute(p: TaskReplPayload, ctx: TaskContext) { return this.runReplTerminal.execute(ctx.taskId, p.port, ctx); }

	/** Routed here from the gateway — what's typed in the studio's terminal. */
	write(taskId: string, data: Uint8Array) { this.writeReplTerminal.execute(taskId, data); }
}
