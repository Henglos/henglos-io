// Wire-level frame protocol used to talk to HIO firmware.
// Mirrors packages/hio-system/hio/system/core/services/PacketCodec.py (the
// MicroPython runtime) — keep in sync; its header documents every layout below.
//
// Base Frame:
//   +-----+-----+------------+----------+---------+-------+-----+
//   |  8  | 16  |     8      |    16    |   ...   |  16   |  8  |
//   +-----+-----+------------+----------+---------+-------+-----+
//   | STX | LEN | FRAME TYPE | FRAME ID | PAYLOAD | CRC16 | ETX |
//   +-----+-----+------------+----------+---------+-------+-----+
//
// LEN = FRAME_TYPE + FRAME_ID + PAYLOAD + CRC16 (ETX not included).
// CRC16 is calculated over FRAME_TYPE + FRAME_ID + PAYLOAD bytes (CRC-16/MODBUS: init 0xFFFF, poly 0xA001).
//
// REQUEST payload = COMMAND_ID(8) + body. Execute/Record's body carries
// ACTION_ID(16) + INSTANCE_ID(16) + OUTPUTS_SIZE(8) + OUTPUTS[OUTPUT_ID(16)+TARGET_INSTANCE_ID(16)] +
// [CONFIG_ID(16)+DATA_SIZE(16)+DATA]* (see @henglosio/workflow's
// GenerateExecuteCommand, which builds that body). ACTION_ID identifies the
// action TYPE (shared by every instance of it); INSTANCE_ID identifies this one
// graph-node occurrence — see GenerateExecuteCommand's computeWireInstanceId.
// Standalone/Play/FinishRecord/EraseRecord/GetVersion have no body at all — see
// buildEmptyPayload below.

export const FRAME_STX = 0x02;
/** A frame's last byte. */
export const FRAME_ETX = 0x03;

// 0x03-0x05 are unused: the C++ firmware's PARTIAL frames (multi-frame
// requests) are gone — a value too big for one EXECUTE travels as a STREAM
// instead, and components are installed as files over the REPL, not by frame.
export enum FrameType {
	REQUEST = 0x01,
	RESPONSE = 0x02,
	// DEBUG_TYPE(8) (see DebugLevel) + message bytes up to the end of the payload.
	DEBUG = 0x06,
	// Raw bytes, no COMMAND_ID / command layer — board-to-board only (the Serial
	// component). Never appears on the host<->device control link; consumers that
	// scan control-link frames skip it the same way they skip DEBUG.
	DATA = 0x10,
}

// Firmware limits (PacketCodec.py) — a frame or EXECUTE past any of these is
// rejected or truncated on the board, so the host checks them before sending.
export const MAX_PACKET_SIZE = 256;          // upper bound for LEN
/** Room for PAYLOAD in one frame. */
export const MAX_PAYLOAD_SIZE = MAX_PACKET_SIZE - 3 - 2;  // LEN minus FRAME_TYPE + FRAME_ID and CRC16
/** One LITERAL config value, at most. */
export const MAX_DATA_BUFFER = 64;           // one LITERAL config value
/** One CODE config's source, at most. */
export const MAX_CODE_BUFFER = 192;          // one CODE config's source
/** Configs in one EXECUTE, at most. */
export const MAX_CONFIGS_PER_COMMAND = 15;
/** Outputs (wires) of one action, at most. */
export const MAX_OUTPUTS_PER_ACTION = 4;

// RESPONSE ID of an EXECUTE: the output the action ended on. Custom outputs
// are generateId("<output name>").
export enum OutputId {
	SUCCESS = 0x0000,
	ACTION_NOT_FOUND = 0xfffe, // no installed action has this ACTION_ID
	FALLBACK = 0xffff,
}

// RESPONSE ID of a RESPONSE STREAM — see PacketCodec.py's STREAMS section.
export enum StreamStatus {
	OK = 0x0000,
	WAITING = 0xfffa,   // frame rejected: an action is reading a stream
	TIMEOUT = 0xfffb,   // no chunk arrived in time — stream closed
	INVALID = 0xfffc,   // misaligned chunk or size mismatch — stream closed
	NOT_FOUND = 0xfffd, // no open stream for STREAM_REF + CONFIG_ID
}

// DEBUG_TYPE of a DEBUG frame.
export enum DebugLevel {
	INFO = 0x00,
	WARN = 0x01,
	ERROR = 0x02,
}

/** The frame checksum: CRC-16/MODBUS (reflected poly 0xA001, init 0xFFFF) — the same as the firmware's PacketCodec. */
export function crc16(data: Uint8Array): number {
	let crc = 0xffff;
	for (let i = 0; i < data.length; i++) {
		crc ^= data[i]!;
		for (let b = 0; b < 8; b++) {
			crc = (crc & 1) ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
		}
	}
	return crc & 0xffff;
}

/**
 * Correlation id for a REQUEST frame — the firmware echoes it back on the
 * matching RESPONSE so the caller can line the two up. Random rather than a
 * counter since callers (hosting's Record/Execute use-cases) don't share any
 * state to keep a counter in sync across.
 */
export function randomFrameId(): number {
	return Math.floor(Math.random() * 0x10000);
}

/**
 * Wraps a REQUEST/RESPONSE payload (as produced by a command builder, e.g. the
 * workflow package's GenerateExecuteCommand) into a full device-ready frame:
 * STX + LEN + FRAME_TYPE + FRAME_ID + PAYLOAD + CRC16 + ETX.
 */
export function buildFrame(frameType: FrameType, frameId: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {

	const body = new Uint8Array(3 + payload.length);
	body[0] = frameType;
	body[1] = frameId & 0xff;
	body[2] = (frameId >> 8) & 0xff;
	body.set(payload, 3);

	const crc = crc16(body);
	const frameLen = body.length + 2;

	const frame = new Uint8Array(3 + body.length + 3);
	frame[0] = FRAME_STX;
	frame[1] = frameLen & 0xff;
	frame[2] = (frameLen >> 8) & 0xff;
	frame.set(body, 3);
	frame[3 + body.length] = crc & 0xff;
	frame[3 + body.length + 1] = (crc >> 8) & 0xff;
	frame[3 + body.length + 2] = FRAME_ETX;

	return frame;

}

/**
 * Convenience over buildFrame for the overwhelmingly common case (Host →
 * Firmware): wraps `payload` as a REQUEST frame with a fresh random frame id.
 * Every Execute/Record/EraseRecord/FinishRecord frame the host sends is one of
 * these — callers that need a different FrameType or an explicit frameId
 * (e.g. echoing one back) should use buildFrame directly.
 */
export function buildRequestFrame(payload: Uint8Array): Uint8Array<ArrayBuffer> {
	return buildFrame(FrameType.REQUEST, randomFrameId(), payload);
}

// REQUEST command ids the firmware handles — see PacketCodec.py's CommandId
// (single source of truth on the firmware side). Execute/Record are
// built by @henglosio/workflow's GenerateExecuteCommand instead of here, since
// building their body requires walking the workflow graph.
export enum CommandId {
	EXECUTE = 0x01,
	STANDALONE = 0x02,
	PLAY = 0x03,
	RECORD = 0x04,
	FINISH_RECORD = 0x05,
	ERASE_RECORD = 0x06,
	GET_VERSION = 0x07,
	// Persist the control-link UART config (baud + optional pins) on the
	// board. See firmware's SetConnectionCommand + buildSetConnectionPayload.
	SET_CONNECTION = 0x08,
	// Reserved: components are installed as .mpy files over the REPL, not by
	// frame (see the driver's ReplSession).
	ADD_COMPONENT = 0x09,
	// Drop one installed action — NAME_LEN+NAME, see buildRemoveComponentPayload.
	REMOVE_COMPONENT = 0x0A,
	// One chunk of a STREAM config, and every answer to one — see
	// PacketCodec.py's STREAMS section and StreamStatus.
	STREAM = 0x0B,
	// One action on its own, outside the program's flow (the studio's ▶ on a
	// node) — same body as EXECUTE, answered like one. See RunPacket.py.
	RUN = 0x0C,
	// Overwrite values the run holds — the studio's debugger editing what an
	// action published. Body: LITERAL entries without VALUE_TYPE (ContextSetPacket.py).
	CONTEXT_SET = 0x0D,
	// Between branches: did an armed trigger fire? Body WAIT_MS(16) — how long
	// to wait for one (0: only check). Answered with ID = the trigger's
	// INSTANCE_ID (0: none) and what it published; the board then points at
	// its Out. See TriggerPollPacket.py.
	TRIGGER_POLL = 0x0E,
}

/** Longest TRIGGER_POLL wait the board takes (TriggerPollPacket.MAX_WAIT_MS). */
export const TRIGGER_POLL_MAX_WAIT_MS = 60_000;

/** TRIGGER_POLL REQUEST payload: COMMAND_ID + WAIT_MS(16 LE). */
export function buildTriggerPollPayload(waitMs: number): Uint8Array<ArrayBuffer> {
	const wait = Math.max(0, Math.min(TRIGGER_POLL_MAX_WAIT_MS, Math.round(waitMs)));
	return new Uint8Array([CommandId.TRIGGER_POLL, wait & 0xff, (wait >> 8) & 0xff]);
}

/**
 * Builds a REQUEST payload for a command with no body — Standalone, Play,
 * FinishRecord, EraseRecord, GetVersion. Just the COMMAND_ID byte; the firmware
 * always replies with a RESPONSE.
 */
export function buildEmptyPayload(commandId: CommandId): Uint8Array<ArrayBuffer> {
	return new Uint8Array([commandId]);
}

/** SET_CONNECTION's settings: the control link's baud rate and pins. */
export type SetConnectionOptions = {
	baud: number;
	txPin?: number;   // omit / -1 -> keep the port's wired default (e.g. UART0's USB pins)
	rxPin?: number;
	dataBits?: number;              // omit -> keep (8)
	parity?: "N" | "E" | "O";       // omit -> keep (N)
	stopBits?: number;              // omit -> keep (1)
	reboot?: boolean;               // esp_restart() after the record is persisted
};

// SET_CONNECTION REQUEST payload — COMMAND_ID(0x08) then:
//   TARGET(8)=0  BAUD(32 LE)  TX_PIN(8)  RX_PIN(8)  DATA_BITS(8)  PARITY(8)  STOP_BITS(8)  FLAGS(8)
// A pin of 0xFF, or dataBits/parity/stopBits of 0, means "keep current". FLAGS
// bit0 = reboot. Mirrors firmware's SetConnectionCommand.py.
export function buildSetConnectionPayload(opts: SetConnectionOptions): Uint8Array<ArrayBuffer> {
	const body = new Uint8Array(11);
	body[0] = CommandId.SET_CONNECTION;
	body[1] = 0x00; // TARGET: control link
	body[2] = opts.baud & 0xff;
	body[3] = (opts.baud >> 8) & 0xff;
	body[4] = (opts.baud >> 16) & 0xff;
	body[5] = (opts.baud >> 24) & 0xff;
	body[6] = opts.txPin === undefined || opts.txPin < 0 ? 0xff : opts.txPin & 0xff;
	body[7] = opts.rxPin === undefined || opts.rxPin < 0 ? 0xff : opts.rxPin & 0xff;
	body[8] = opts.dataBits ?? 0;
	body[9] = opts.parity ? opts.parity.charCodeAt(0) : 0;
	body[10] = opts.stopBits ?? 0;
	// FLAGS byte follows; the firmware treats a missing byte as 0, but always
	// send it so `reboot` is unambiguous.
	const withFlags = new Uint8Array(12);
	withFlags.set(body, 0);
	withFlags[11] = opts.reboot ? 0x01 : 0x00;
	return withFlags;
}

// REMOVE_COMPONENT REQUEST payload: COMMAND_ID(8) + NAME_LEN(8) + NAME, NAME
// being the action's "<component>/<action>".
export function buildRemoveComponentPayload(name: string): Uint8Array<ArrayBuffer> {

	const nameBytes = new TextEncoder().encode(name);
	if (nameBytes.length > 0xff) {
		throw new Error(`REMOVE_COMPONENT name too long: "${name}" (${nameBytes.length} bytes, max 255)`);
	}

	const payload = new Uint8Array(2 + nameBytes.length);
	payload[0] = CommandId.REMOVE_COMPONENT;
	payload[1] = nameBytes.length;
	payload.set(nameBytes, 2);

	return payload;

}

/** A frame read off the wire: its type, id and payload. */
export type ParsedFrame = {
	frameType: number;
	frameId: number;
	payload: Uint8Array;
	// The exact STX..ETX bytes of the frame, e.g. for relaying verbatim without
	// re-encoding (buildFrame(frameType, frameId, payload) reproduces the same bytes).
	raw: Uint8Array;
	// Bytes consumed from the start of `buffer`, including any leading noise skipped
	// before STX (e.g. an ESP32's boot log sharing the same UART).
	consumed: number;
};

/**
 * Scans `buffer` for the first structurally valid frame (STX/LEN/CRC/ETX all
 * consistent), skipping any leading noise. Returns null if no complete valid frame
 * is present yet — callers should buffer more bytes and retry.
 */
export function parseFrame(buffer: Uint8Array): ParsedFrame | null {

	let start = 0;

	for (;;) {

		let idx = -1;
		for (let i = start; i < buffer.length; i++) {
			if (buffer[i] === FRAME_STX) { idx = i; break; }
		}
		if (idx === -1 || idx + 3 > buffer.length) return null;

		const frameLen = buffer[idx + 1]! | (buffer[idx + 2]! << 8);
		const total = 3 + frameLen + 1; // STX + LEN(2) + (FRAME_TYPE+FRAME_ID+PAYLOAD+CRC) + ETX

		if (idx + total > buffer.length) return null; // not enough bytes yet

		if (buffer[idx + total - 1] !== FRAME_ETX) { start = idx + 1; continue; }

		const body = buffer.slice(idx + 3, idx + 3 + frameLen - 2);
		const crcRead = buffer[idx + 3 + frameLen - 2]! | (buffer[idx + 3 + frameLen - 1]! << 8);
		if (crc16(body) !== crcRead) { start = idx + 1; continue; }

		return {
			frameType: body[0]!,
			frameId: body[1]! | (body[2]! << 8),
			payload: body.slice(3),
			raw: buffer.slice(idx, idx + total),
			consumed: idx + total,
		};

	}

}

/** A RESPONSE frame's content: which command it answers, its ID and the values it carries. */
export type ParsedResponse = {
	commandId: number;
	// OutputId for EXECUTE, StreamStatus for STREAM, 0x0000 otherwise.
	id: number;
	// DATA entries, CONFIG_ID -> DATA (no type byte on the wire).
	configs: Map<number, Uint8Array>;
};

// A RESPONSE frame's payload: COMMAND_ID(8) + ID(16) + [CONFIG_ID(16) +
// DATA_SIZE(16) + DATA]*. Null when it's too short to be one.
export function parseResponse(payload: Uint8Array): ParsedResponse | null {

	if (payload.length < 3) return null;

	const configs = new Map<number, Uint8Array>();
	let index = 3;
	while (index + 4 <= payload.length) {
		const configId = payload[index]! | (payload[index + 1]! << 8);
		const size = payload[index + 2]! | (payload[index + 3]! << 8);
		configs.set(configId, payload.slice(index + 4, index + 4 + size));
		index += 4 + size;
	}

	return { commandId: payload[0]!, id: payload[1]! | (payload[2]! << 8), configs };

}

// A DEBUG frame's payload: DEBUG_TYPE(8) + UTF-8 message.
export function parseDebug(payload: Uint8Array): { level: DebugLevel; message: string } {
	return { level: payload[0] ?? DebugLevel.INFO, message: new TextDecoder().decode(payload.subarray(1)) };
}
