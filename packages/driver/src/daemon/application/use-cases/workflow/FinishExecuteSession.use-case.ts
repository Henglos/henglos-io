import { injectable } from "tsyringe";
import { ExecuteSessionsService } from "../../services/ExecuteSessions.service.js";

/** Ends an execute session: its REPL closes, and the task with it. */
@injectable()
export class FinishExecuteSessionUseCase {

	constructor(private readonly executeSessions: ExecuteSessionsService) {}

	execute(taskId: string): Promise<void> {
		return this.executeSessions.finish(taskId);
	}

}
