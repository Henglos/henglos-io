import { injectable } from "tsyringe";
import { type TaskExecutePayload, type TaskType, TaskExecutePayloadSchema } from "@henglosio/shared";

import type { ITaskCommand } from "../../domain/interfaces/ICommand.interface.js";
import { TaskContext } from "../../domain/entities/TaskContext.js";
import { StartExecuteSessionUseCase } from "../use-cases/workflow/StartExecuteSession.use-case.js";
import { ContinueExecuteSessionUseCase } from "../use-cases/workflow/ContinueExecuteSession.use-case.js";
import { FinishExecuteSessionUseCase } from "../use-cases/workflow/FinishExecuteSession.use-case.js";

/**
 * The `execute` task (Play, ▶ run, debug): runs frames on the board, sent one by one by the
 * hosting's graph walker (continue / finish). Locks the board's port.
 */
@injectable()
export class ExecuteTaskCommand implements ITaskCommand<TaskExecutePayload> {
	readonly type: TaskType = "execute";
	constructor(
		private readonly startExecuteSession: StartExecuteSessionUseCase,
		private readonly continueExecuteSession: ContinueExecuteSessionUseCase,
		private readonly finishExecuteSession: FinishExecuteSessionUseCase,
	) {}
	isValidPayload(p: unknown): p is TaskExecutePayload { return TaskExecutePayloadSchema.safeParse(p).success; }
	locks(p: TaskExecutePayload): string[] { return [`port:${p.port}`]; }
	execute(p: TaskExecutePayload, ctx: TaskContext) { return this.startExecuteSession.execute(ctx.taskId, p.workflowId, p.port, p.baudrate, p.frame, ctx, p.install); }

	/** Routed here from the gateway — hosting's graph walker drives these. */
	continue(taskId: string, frame: Uint8Array) { return this.continueExecuteSession.execute(taskId, frame); }
	finish(taskId: string) { return this.finishExecuteSession.execute(taskId); }
}
