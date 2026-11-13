import type { Socket } from "socket.io";
import { OutputId, parseFrame, parseResponse, FrameType, type ParsedResponse } from "@henglosio/shared";
import { computeWireOutputId, generateId, getActionOutputs, isJsonShape, isStringShape, shapeLabel, type IActionRuntime } from "@henglosio/workflow";

// What the ▶ run and the debugger share: waiting for the board's answer
// through the driver's execute session, and reading what an action did.

/**
 * One action's answer. An action may hold the board for a while on purpose —
 * WiFi's Connect and HTTP's Request wait up to their Timeout (60 s at most),
 * plus DNS and a TLS handshake — so this only catches a board that's gone.
 * Stop ends a session sooner.
 */
export const RESPONSE_TIMEOUT_MS = 75_000;

/**
 * The first answer of a session: before running its frame the driver
 * installs what the workflow uses on the board (BoardInstaller) — compiling
 * and uploading a component takes seconds, not milliseconds.
 */
export const FIRST_RESPONSE_TIMEOUT_MS = 120_000;

/** One value an action published: decoded as well as the wire allows, plus its raw bytes. */
export type RunValue = {
	name: string;
	/** The outputSchema type it was declared with, when it was — as words ("list of { ssid: str }"). */
	type?: string;
	/** A list or an object (a JSON-shaped output) comes decoded. */
	value: number | boolean | string | number[] | unknown[] | Record<string, unknown>;
	bytes: number[];
};

/** What one action did on the board — what the ▶ answers with. */
export type RunActionResult = {
	taskId: string;
	/** The output it ended on — its handle's name (Success, Fallback, a custom one). */
	output: { id: number; name: string };
	/** What it published, by its outputSchema names (unknown ids as hex). */
	values: RunValue[];
};

/**
 * The device's RESPONSE for `taskId`, relayed by the driver — same exchange
 * ExecuteWorkflowTaskUseCase uses. Several sessions can share a driver's
 * socket, hence the id filter.
 *
 * @throws When the driver reports an error, the task ends first (`signal`),
 *   or nothing comes within `timeoutMs`.
 */
export function awaitDriverResponse(socket: Socket, taskId: string, signal: AbortSignal, timeoutMs = RESPONSE_TIMEOUT_MS): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const handler = (data: { id: string; frame?: Uint8Array; error?: string }) => {
			if (data.id !== taskId) return;
			cleanup();
			if (data.error) reject(new Error(data.error));
			else if (data.frame) resolve(data.frame);
			else reject(new Error("Empty response from driver"));
		};
		// The task ended first — the driver failed it (TaskRegistry puts its error on the signal).
		const onAbort = () => { cleanup(); reject(signal.reason instanceof Error ? signal.reason : new Error("aborted")); };
		const timer = setTimeout(() => { cleanup(); reject(new Error("Timed out waiting for the board")); }, timeoutMs);
		function cleanup() {
			clearTimeout(timer);
			socket.off("workflow:execute:response", handler);
			signal.removeEventListener("abort", onAbort);
		}
		if (signal.aborted) return onAbort();
		signal.addEventListener("abort", onAbort);
		socket.on("workflow:execute:response", handler);
	});
}

/**
 * One published value's bytes, decoded as well as the wire allows.
 *
 * RESPONSE DATA carries no type byte: the firmware publishes ints as INTEGER
 * (int32), floats as FLOAT (float32), bools as one byte, strings and bytes as
 * they are (Context.py encode_value). The outputSchema only tells an integer
 * from a float and what a bool is — `type` is one kind, or a list of the kinds
 * it may be.
 */
export function decodeValue(data: Uint8Array, type: unknown): RunValue["value"] {
	// A list or an object (its JSON), or a string — as the outputSchema shape says.
	if (isJsonShape(type) || isStringShape(type)) {
		const text = new TextDecoder().decode(data);
		if (isStringShape(type)) return text;
		try {
			return JSON.parse(text) as RunValue["value"];
		} catch {
			return text;
		}
	}
	const kinds = (Array.isArray(type) ? type : [type]).filter((kind): kind is string => typeof kind === "string");
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	if (data.length === 1 && kinds.includes("bool")) return data[0] !== 0;
	if (data.length === 4 && kinds.length > 0 && kinds.every(kind => kind === "float")) return Math.round(view.getFloat32(0, true) * 1e6) / 1e6;
	if (data.length === 4) return view.getInt32(0, true);
	if (data.length > 0 && data.every(byte => byte >= 0x20 && byte < 0x7f)) return new TextDecoder().decode(data);
	return Array.from(data);
}

// An "any" output holding a list or an object (Code's result): its JSON. The
// wire carries no type, so what it starts with tells — undefined for the rest.
function decodeAnyJson(data: Uint8Array): unknown[] | Record<string, unknown> | undefined {
	if (data[0] !== 0x7b && data[0] !== 0x5b) return undefined;   // "{" / "["
	try {
		const value = JSON.parse(new TextDecoder().decode(data)) as unknown;
		return value !== null && typeof value === "object" ? value as unknown[] | Record<string, unknown> : undefined;
	} catch {
		return undefined;
	}
}

/** The name of the output `id` of `action` — Success, Fallback, a custom one, or its id in hex. */
export function describeOutput(action: IActionRuntime, id: number): string {
	const output = getActionOutputs(action).find(handler => computeWireOutputId(action, handler.base.id) === id);
	if (output) return output.base.name;
	return id === OutputId.SUCCESS ? "Success" : id === OutputId.FALLBACK ? "Fallback" : `0x${id.toString(16).padStart(4, "0")}`;
}

/** A RESPONSE frame's content, or an error explaining why it isn't one. */
export function readResponse(frame: Uint8Array): ParsedResponse {
	const parsed = parseFrame(frame);
	const response = parsed?.frameType === FrameType.RESPONSE ? parseResponse(parsed.payload) : null;
	if (!response) throw new Error("Invalid or unexpected response frame from the board");
	return response;
}

/** What an action published, named and decoded by its outputSchema. */
export function readValues(action: IActionRuntime, response: ParsedResponse): RunValue[] {
	const schema = action.base.outputSchema ?? [];
	return [...response.configs.entries()].map(([id, data]) => {
		const declared = schema.find(output => generateId(output.name.toLowerCase()) === id);
		// Labelled like a declared list / object, so the studio shows it as one (a table).
		const json = declared?.type === "any" ? decodeAnyJson(data) : undefined;
		if (json) return { name: declared!.name, type: Array.isArray(json) ? "list of any" : "{ any }", value: json, bytes: Array.from(data) };
		return {
			name: declared?.name ?? `0x${id.toString(16).padStart(4, "0")}`,
			...(declared && { type: shapeLabel(declared.type) }),
			value: decodeValue(data, declared?.type),
			bytes: Array.from(data),
		};
	});
}
