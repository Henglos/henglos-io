import { Injectable } from "@nestjs/common";

import { DebugSessionsService, type DebugState } from "@/application/services/DebugSessions.service";
import { DebugSessionNotFound } from "@/application/errors/Workflow.error";

/** Reads a debug session. */
@Injectable()
export class GetDebugSessionUseCase {

	constructor(private readonly debugSessions: DebugSessionsService) {}

	/** Where the session stands — to open it again in a studio that lost it. `busy` while a step runs (or Start, before the first answer). */
	execute(userId: string, sessionId: string): DebugState & { workflowId: string; entryId: string; busy: boolean } {
		const session = this.debugSessions.sessions.get(sessionId);
		if (!session || session.userId !== userId) throw new DebugSessionNotFound();
		const state = session.state ?? { sessionId, status: "paused" as const, step: 0, ran: null, nextActionId: null };
		return { ...state, workflowId: session.workflowId, entryId: session.entryId, busy: session.busy };
	}

}
