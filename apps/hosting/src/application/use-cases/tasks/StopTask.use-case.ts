import { Injectable } from "@nestjs/common";
import type { TaskRecord, TaskType } from "@henglosio/shared";

import { TaskRegistry } from "@/application/services/TaskRegistry.service";

/** Stops a running task (compile, flash, record…) — it ends as `cancelled`. */
@Injectable()
export class StopTaskUseCase {

	constructor(
		private readonly taskRegistry: TaskRegistry,
	) {}

	/** `type` comes from the per-operation route (`.../compile/:taskId/stop`,
	 *  `.../flash/:taskId/stop`, ...) — a taskId that belongs to a different
	 *  operation is treated as not found, same as ownership is inside the registry. */
	async execute(userId: string, taskId: string, type: TaskType): Promise<TaskRecord> {
		const task = await this.taskRegistry.stop(taskId, userId, type);
		return task.toRecord();
	}

}
