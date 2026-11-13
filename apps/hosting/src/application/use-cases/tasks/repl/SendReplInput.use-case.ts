import { Injectable } from "@nestjs/common";
import type { ReplData } from "@henglosio/shared";

import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { TaskRegistry } from "@/application/services/TaskRegistry.service";

/** What `userId` typed — to the driver running their repl task, and only theirs. */
@Injectable()
export class SendReplInputUseCase {

	constructor(
		private readonly driverConnection: DriverConnectionRegistry,
		private readonly taskRegistry: TaskRegistry,
	) {}

	execute(userId: string, body: ReplData): void {
		const task = this.taskRegistry.find(body.taskId, userId);
		if (!task || task.type !== "repl" || task.isTerminal) return;
		this.driverConnection.getByDriverId(task.driverId)?.socket.emit("repl:input", { taskId: task.id, data: body.data } satisfies ReplData);
	}

}
