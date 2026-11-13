import { Injectable } from "@nestjs/common";
import { type DriverExecuteFrameInDTO, buildRequestFrame, CommandId, OutputId } from "@henglosio/shared";
import { buildValueEntry, encodeBytes, encodeValue, generateId, type EncodedValue } from "@henglosio/workflow";

import { DebugSessionsService } from "@/application/services/DebugSessions.service";
import { awaitDriverResponse, readResponse } from "../workflow/actionResponse";

/** A value the debugger writes over what an action published. */
export type DebugValue =
	| { name: string; kind: "integer"; value: number }
	| { name: string; kind: "float"; value: number }
	| { name: string; kind: "bool"; value: boolean }
	| { name: string; kind: "string"; value: string }
	| { name: string; kind: "bytes"; value: number[] }
	| { name: string; kind: "list"; value: unknown[] }
	| { name: string; kind: "object"; value: Record<string, unknown> };

/** Overwrites what a debug session's board holds. */
@Injectable()
export class SetDebugValuesUseCase {

	constructor(private readonly debugSessions: DebugSessionsService) {}

	/** Overwrites values the board holds (what the last action published) before the next one runs. */
	async execute(userId: string, sessionId: string, values: DebugValue[]): Promise<{ ok: true }> {

		const session = this.debugSessions.claim(userId, sessionId);

		try {
			// CONTEXT_SET entries: CONFIG_ID(16) + DATA_TYPE(8) + [DATA_SIZE(16) if sized] + DATA.
			const entries = values.map(value => buildValueEntry(generateId(value.name.toLowerCase()), this.encode(value)));

			const payload = new Uint8Array(1 + entries.reduce((sum, entry) => sum + entry.length, 0));
			payload[0] = CommandId.CONTEXT_SET;
			let offset = 1;
			for (const entry of entries) { payload.set(entry, offset); offset += entry.length; }

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

	// A value as CONTEXT_SET carries it: its DataType and its bytes.
	private encode(value: DebugValue): EncodedValue {
		return value.kind === "bytes" ? encodeBytes(value.value) : encodeValue(value.kind, value.value);
	}

}
