import { Injectable, Logger } from "@nestjs/common";

import { TaskRegistry } from "@/application/services/TaskRegistry.service";

/** The studio went away (closed, reloaded): its terminals close — they'd hold the board otherwise. */
@Injectable()
export class EndUserReplTasksUseCase {

	private readonly logger = new Logger(EndUserReplTasksUseCase.name);

	constructor(private readonly taskRegistry: TaskRegistry) {}

	async execute(userId: string): Promise<void> {
		for (const task of this.taskRegistry.unfinished(userId, "repl")) {
			await this.taskRegistry.stop(task.id, userId).catch(err => this.logger.warn(`REPL ${task.id} didn't stop: ${err}`));
		}
	}

}
