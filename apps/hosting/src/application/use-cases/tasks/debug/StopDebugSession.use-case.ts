import { Injectable } from "@nestjs/common";

import { DebugSessionsService } from "@/application/services/DebugSessions.service";
import { DebugSessionNotFound } from "@/application/errors/Workflow.error";

/** Closes a debug session. */
@Injectable()
export class StopDebugSessionUseCase {

	constructor(private readonly debugSessions: DebugSessionsService) {}

	/** Ends the session — the driver closes the REPL and frees the port. @throws DebugSessionNotFound. */
	execute(userId: string, sessionId: string): { stopped: true } {
		const session = this.debugSessions.sessions.get(sessionId);
		if (!session || session.userId !== userId) throw new DebugSessionNotFound();
		session.finish();
		return { stopped: true };
	}

}
