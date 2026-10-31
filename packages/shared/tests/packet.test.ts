import { describe, expect, test } from "vitest";
import {
	buildEmptyPayload,
	buildFrame,
	buildRemoveComponentPayload,
	parseDebug,
	parseFrame,
	parseResponse,
	CommandId,
	DebugLevel,
	FrameType,
	OutputId,
	StreamStatus,
} from "../src/index.js";

const hex = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));

// Frames built by the firmware's own PacketCodec.py — the host must produce
// and read exactly these bytes.
const FIRMWARE = {
	getVersionRequest: hex("0206000101000711da03"),                                  // REQUEST id=1 GET_VERSION
	getVersionResponse: hex("02110002010007000001000500312e302e30067303"),           // RESPONSE id=1, {1: "1.0.0"}
	streamNotFound: hex("0208000209000bfdffacea03"),                                 // RESPONSE id=9 STREAM NOT_FOUND
	debug: hex("020800060500016869725303"),                                          // DEBUG id=5 WARN "hi"
};

describe("wire compatibility with PacketCodec.py", () => {

	test("builds the same REQUEST bytes", () => {
		expect(buildFrame(FrameType.REQUEST, 1, buildEmptyPayload(CommandId.GET_VERSION))).toEqual(FIRMWARE.getVersionRequest);
	});

	test("reads a RESPONSE with config entries", () => {
		const frame = parseFrame(FIRMWARE.getVersionResponse)!;
		expect(frame.frameType).toBe(FrameType.RESPONSE);
		expect(frame.frameId).toBe(1);

		const response = parseResponse(frame.payload)!;
		expect(response.commandId).toBe(CommandId.GET_VERSION);
		expect(response.id).toBe(OutputId.SUCCESS);
		expect(new TextDecoder().decode(response.configs.get(1))).toBe("1.0.0");
	});

	test("reads a STREAM status", () => {
		const response = parseResponse(parseFrame(FIRMWARE.streamNotFound)!.payload)!;
		expect(response.commandId).toBe(CommandId.STREAM);
		expect(response.id).toBe(StreamStatus.NOT_FOUND);
		expect(response.configs.size).toBe(0);
	});

	test("reads a DEBUG frame", () => {
		const frame = parseFrame(FIRMWARE.debug)!;
		expect(frame.frameType).toBe(FrameType.DEBUG);
		expect(parseDebug(frame.payload)).toEqual({ level: DebugLevel.WARN, message: "hi" });
	});

	test("a payload too short for a RESPONSE parses to null", () => {
		expect(parseResponse(new Uint8Array([CommandId.EXECUTE, 0]))).toBeNull();
	});

});

describe("buildRemoveComponentPayload", () => {

	test("encodes COMMAND_ID + NAME_LEN + NAME", () => {

		const payload = buildRemoveComponentPayload("gpio/write");

		expect(payload[0]).toBe(CommandId.REMOVE_COMPONENT);
		expect(payload[1]).toBe("gpio/write".length);
		expect(new TextDecoder().decode(payload.subarray(2))).toBe("gpio/write");

	});

});
