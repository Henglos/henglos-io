import { describe, expect, test } from "vitest";
import { BoardFirmwareSchema, FlashTargetSchema, TaskFlashPayloadSchema } from "../src/index.js";

describe("flash target", () => {

	test("serial: a port, the baudrate optional", () => {
		expect(FlashTargetSchema.parse({ method: "serial", port: "COM7" })).toEqual({ method: "serial", port: "COM7" });
		expect(FlashTargetSchema.parse({ method: "serial", port: "COM7", baudrate: 921600 }).method).toBe("serial");
	});

	test("uf2: a volume — and a port (the REPL) when the board has one", () => {
		expect(FlashTargetSchema.safeParse({ method: "uf2", port: "COM7", volume: "RPI-RP2" }).success).toBe(true);
		// A board in its bootloader shows only its drive.
		expect(FlashTargetSchema.safeParse({ method: "uf2", volume: "E:\\" }).success).toBe(true);
		expect(FlashTargetSchema.safeParse({ method: "uf2", port: "COM7" }).success).toBe(false);
		expect(FlashTargetSchema.safeParse({ method: "uf2", port: "COM7", volume: "" }).success).toBe(false);
		expect(FlashTargetSchema.safeParse({ method: "uf2", port: "", volume: "RPI-RP2" }).success).toBe(false);
	});

	test("an unknown method is refused", () => {
		expect(FlashTargetSchema.safeParse({ method: "ota", port: "COM7" }).success).toBe(false);
	});

	test("a flash task carries its target", () => {
		expect(TaskFlashPayloadSchema.safeParse({ workflowId: "w", target: { method: "serial", port: "COM7" } }).success).toBe(true);
		expect(TaskFlashPayloadSchema.safeParse({ workflowId: "w", port: "COM7", baudrate: 115200 }).success).toBe(false);
	});

});

describe("board firmware methods", () => {

	const firmware = { micropython: "1.29.0", image: "test/workbench:1", script: "./firmware.ts" };

	test("absent: serial", () => {
		expect(BoardFirmwareSchema.parse(firmware).methods).toEqual(["serial"]);
	});

	test("listed: kept in order", () => {
		expect(BoardFirmwareSchema.parse({ ...firmware, methods: ["uf2", "serial"] }).methods).toEqual(["uf2", "serial"]);
	});

	test("empty or unknown: refused", () => {
		expect(BoardFirmwareSchema.safeParse({ ...firmware, methods: [] }).success).toBe(false);
		expect(BoardFirmwareSchema.safeParse({ ...firmware, methods: ["jtag"] }).success).toBe(false);
	});

});
