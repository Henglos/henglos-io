import { Injectable } from "@nestjs/common";
import { type DriverExecuteFrameInDTO, buildRequestFrame } from "@henglosio/shared";
import { GenerateExecuteCommand, resolveWorkflowAction } from "@henglosio/workflow";

import { DebugSessionsService, type DebugState } from "@/application/services/DebugSessions.service";
import { awaitDriverResponse } from "../workflow/actionResponse";

/** A debug session's next step. */
@Injectable()
export class ContinueDebugSessionUseCase {

	private readonly generateExecuteCommand = new GenerateExecuteCommand();

	constructor(private readonly debugSessions: DebugSessionsService) {}

	/** Runs the next action (with the workflow as it is now) and pauses again. */
	async execute(userId: string, sessionId: string): Promise<DebugState> {

		const session = this.debugSessions.claim(userId, sessionId);

		try {
			if (session.listening) return await this.debugSessions.listen(session);

			if (!session.nextActionId) {
				session.finish();
				return { sessionId, status: "finished", step: session.step, ran: null, nextActionId: null };
			}

			// Configs edited while paused are in the collab doc — read it back.
			const workflow = await this.debugSessions.load(session.workflowId, userId);
			let actionId: string | null = session.nextActionId;
			// The next one was switched off (or rewired) while paused: go on to
			// whatever now follows the step that ran.
			if (!resolveWorkflowAction(workflow, actionId) && session.ran) {
				actionId = this.debugSessions.nextAfter(session, workflow, session.ran.actionId, session.ran.outputId);
				if (!actionId) {
					session.finish();
					return { sessionId, status: "finished", step: session.step, ran: null, nextActionId: null };
				}
			}
			const payload = this.generateExecuteCommand.execute(workflow, actionId);
			if (!payload) throw new Error("The next action is no longer in the workflow");

			const answer = awaitDriverResponse(session.socket, session.id, session.signal);
			session.socket.emit("workflow:execute:continue", { id: session.id, frame: buildRequestFrame(payload) } satisfies DriverExecuteFrameInDTO);
			return this.debugSessions.step(session, workflow, actionId, await answer);
		} catch (err) {
			// Stopped while it waited (Stop during Listen): the driver ended the
			// task — that's the session over, not a step that failed.
			if (!this.debugSessions.sessions.has(session.id)) return { sessionId, status: "finished", step: session.step, ran: null, nextActionId: null };
			throw await this.debugSessions.abort(session, err);
		} finally {
			session.busy = false;
		}

	}

}
