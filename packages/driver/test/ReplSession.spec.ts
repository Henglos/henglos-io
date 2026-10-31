import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SerialPortMock } from "serialport";
import { buildEmptyPayload, buildFrame, CommandId, FrameType, OutputId, parseResponse } from "@henglosio/shared";

import { FakeBoard, openFake } from "./support/FakeBoard.js";

let board: FakeBoard;

const open = () => openFake(board);

describe("ReplSession against the runtime", () => {

	beforeEach(() => {
		SerialPortMock.binding.createPort("/dev/fake");
		board = new FakeBoard(fs.mkdtempSync(path.join(os.tmpdir(), "hio-fake-board-")));
	});

	afterEach(() => {
		board.stop();
		SerialPortMock.binding.reset();
		fs.rmSync(board.sandbox, { recursive: true, force: true });
	});

	test("exchanges a GET_VERSION", async () => {
		const repl = await open();
		const { response } = await repl.exchange(buildFrame(FrameType.REQUEST, 7, buildEmptyPayload(CommandId.GET_VERSION)));
		await repl.close(false);

		expect(response?.frameId).toBe(7);
		const answer = parseResponse(response!.payload)!;
		expect(answer.commandId).toBe(CommandId.GET_VERSION);
		expect(answer.id).toBe(OutputId.SUCCESS);
		expect(new TextDecoder().decode(answer.configs.get(1))).toBe("1.0.0");
	}, 30000);

	test("keeps the runtime's state between exchanges", async () => {
		const repl = await open();
		const erase = await repl.exchange(buildFrame(FrameType.REQUEST, 1, buildEmptyPayload(CommandId.ERASE_RECORD)));
		const finish = await repl.exchange(buildFrame(FrameType.REQUEST, 2, buildEmptyPayload(CommandId.FINISH_RECORD)));
		await repl.close(false);

		expect(parseResponse(erase.response!.payload)!.id).toBe(OutputId.SUCCESS);
		expect(parseResponse(finish.response!.payload)!.id).toBe(OutputId.SUCCESS);
	}, 30000);

	test("reads the board's .mpy version", async () => {
		const repl = await open();
		expect(await repl.mpyVersion()).toEqual([6, 3]);
		await repl.close(false);
	}, 30000);

	test("uploads files, replacing what was there", async () => {
		const repl = await open();
		await repl.mkdirs(["/hio", "/hio/sub"]);
		await repl.writeFile("/hio/sub/old.mpy", Buffer.from("old"));
		await repl.remove("/hio");
		await repl.mkdirs(["/hio", "/hio/sub"]);
		const big = Buffer.alloc(3000, 0xab);
		await repl.writeFile("/hio/sub/new.mpy", big);
		await repl.close(true);

		expect(fs.existsSync(path.join(board.sandbox, "hio", "sub", "old.mpy"))).toBe(false);
		expect(fs.readFileSync(path.join(board.sandbox, "hio", "sub", "new.mpy"))).toEqual(big);
		expect(board.resets).toBe(1);
	}, 30000);

	// Regression: the wait for "OK" left a stale timer behind that, firing
	// later, unregistered the wait for the output — anything slower than
	// ~50ms (deleting files on flash) then timed out.
	test("code that takes a while still gets its output", async () => {
		const repl = await open();
		expect((await repl.exec("import time\ntime.sleep(0.3)\nprint('done')")).trim()).toBe("done");
		await repl.remove("/nothing-here");
		await repl.close(false);
	}, 30000);

	test("an error on the board surfaces as a ReplError", async () => {
		const repl = await open();
		await expect(repl.exec("raise ValueError('nope')")).rejects.toThrow("ValueError: nope");
		await repl.close(false);
	}, 30000);

});
