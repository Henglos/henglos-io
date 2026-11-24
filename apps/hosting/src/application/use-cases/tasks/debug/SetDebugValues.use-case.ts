import { Injectable } from "@nestjs/common";
import { type ContextValue, type DriverExecuteFrameInDTO, buildRequestFrame, OutputId } from "@henglosio/shared";

import { DebugSessionsService } from "@/application/services/DebugSessions.service";
import { awaitDriverResponse, readResponse } from "../workflow/actionResponse";
import { buildContextSetPayload } from "../workflow/contextSet";

/** A value the debugger writes over what an action published. */
export type DebugValue = ContextValue;

/** Overwrites what a debug session's board holds. */
@Injectable()
export class SetDebugValuesUseCase {

	constructor(private readonly debugSessions: DebugSessionsService) {}

	/** Overwrites values the board holds (what the last action published) before the next one runs. */
	async execute(userId: string, sessionId: string, values: DebugValue[]): Promise<{ ok: true }> {

		const session = this.debugSessions.claim(userId, sessionId);

		try {
			const payload = buildContextSetPayload(values);

			const answer = awaitDriverResponse(session.socket, session.id, session.signal);
			session.socket.emit("workflow:execute:continue", { id: session.id, frame: buildRequestFrame(payload) } satisfies DriverExecuteFrameInDTO);
			const response = readResponse(await answer);
			if (response.id !== OutputId.SUCCESS) throw new Error("The board had no room for those values");

			return { ok: true };
		} catch (err) {
			throw await this.debugSessions.abort(session, err);
		} finally {
			session.busy = false;
		}

	}

}
