import "reflect-metadata";      // the services are tsyringe @injectable()s
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SerialPortMock } from "serialport";
import type { BoardInstall } from "@henglosio/shared";

import { BoardInstaller, relativeImports } from "../src/daemon/application/services/BoardInstaller.service.js";
import { MpyCompiler } from "../src/daemon/application/services/MpyCompiler.service.js";
import type { PackageService } from "../src/daemon/application/services/PackageService.service.js";
import { FakeBoard, openFake } from "./support/FakeBoard.js";

const COMPONENTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "library", "components");

// The packages "cached on the driver": the real component folders of the repo.
const packages = {
	getPackage: async (name: string, version: string) => ({
		type: "component" as const, name, version,
		path: path.join(COMPONENTS, name === "@henglosio/component-display" ? "Display" : "GPIO"),
	}),
	install: async () => null,
} as unknown as PackageService;

const DISPLAY_PRINT: BoardInstall["components"][number] = {
	name: "@henglosio/component-display", version: "1.1.0", module: "display",
	actions: [{ module: "print", script: "src/print.py" }],
};
const GPIO_WRITE: BoardInstall["components"][number] = {
	name: "@henglosio/component-gpio", version: "1.0.0", module: "gpio",
	actions: [{ module: "write", script: "src/write.py" }],
};

const silent = { progress: () => {}, info: () => {} };

let board: FakeBoard;
const installer = new BoardInstaller(packages, new MpyCompiler());

// Every file under the board's sandbox, as board paths.
const boardFiles = (root = board.sandbox, prefix = ""): string[] =>
	fs.readdirSync(root, { withFileTypes: true }).flatMap(entry =>
		entry.isDirectory() ? boardFiles(path.join(root, entry.name), `${prefix}/${entry.name}`) : [`${prefix}/${entry.name}`]).sort();

const writes = () => board.ran.filter(code => code.includes("open(") && code.includes("'wb'")).length;

describe("relativeImports", () => {
	test("finds `from .x import` and `from . import a, b`", () => {
		expect(relativeImports("from .oled import a, b\nfrom . import fonts, icons as i\nimport framebuf\nfrom array import array\n  from .driver import (x,\n")).toEqual(["oled", "fonts", "icons", "driver"]);
	});
});

describe("BoardInstaller against the runtime", () => {

	beforeEach(() => {
		SerialPortMock.binding.createPort("/dev/fake");
		board = new FakeBoard(fs.mkdtempSync(path.join(os.tmpdir(), "hio-fake-board-")));
	});

	afterEach(() => {
		board.stop();
		SerialPortMock.binding.reset();
		fs.rmSync(board.sandbox, { recursive: true, force: true });
	});

	test("installs only the action used and what it imports, compiled — then nothing on a second Play", async () => {
		const repl = await openFake(board);
		await installer.sync(repl, { components: [DISPLAY_PRINT], files: [] }, silent);

		expect(boardFiles()).toEqual([
			"/components/.index.json",
			"/components/__init__.py",
			"/components/display/__init__.py",
			"/components/display/fonts.mpy",
			"/components/display/oled.mpy",
			"/components/display/print.mpy",
		]);
		const mpy = fs.readFileSync(path.join(board.sandbox, "components", "display", "print.mpy"));
		expect([...mpy.subarray(0, 2)]).toEqual([0x4d, 0x06]);       // "M", ABI v6

		const before = writes();
		await installer.sync(repl, { components: [DISPLAY_PRINT], files: [] }, silent);
		expect(writes()).toBe(before);
		await repl.close(false);
	}, 60000);

	test("swaps what the workflow no longer uses, and syncs attached files", async () => {
		const repl = await openFake(board);
		await installer.sync(repl, { components: [DISPLAY_PRINT], files: [] }, silent);

		const data = new Uint8Array([0x50, 0x34, 0x0a, 0x38, 0x20, 0x31, 0x0a, 0xff]);    // "P4\n8 1\n" + one row
		const sha256 = createHash("sha256").update(data).digest("hex");
		await installer.sync(repl, { components: [GPIO_WRITE], files: [{ path: `/files/${sha256.slice(0, 12)}.pbm`, sha256, data }] }, silent);
		await repl.close(false);

		expect(boardFiles()).toEqual([
			"/components/.index.json",
			"/components/__init__.py",
			"/components/gpio/__init__.py",
			"/components/gpio/write.mpy",
			"/files/.index.json",
			`/files/${sha256.slice(0, 12)}.pbm`,
		]);
		expect([...fs.readFileSync(path.join(board.sandbox, "files", `${sha256.slice(0, 12)}.pbm`))]).toEqual([...data]);
	}, 60000);

	test("a credential is written to /secrets, rewritten when it changes, and removed once nothing uses it", async () => {
		const repl = await openFake(board);
		const secret = (json: string) => {
			const data = new TextEncoder().encode(json);
			return { path: "/secrets/cred-1.json", sha256: createHash("sha256").update(data).digest("hex"), data };
		};

		await installer.sync(repl, { components: [], files: [secret('{"ssid":"Home","password":"a"}')] }, silent);
		expect(fs.readFileSync(path.join(board.sandbox, "secrets", "cred-1.json"), "utf8")).toBe('{"ssid":"Home","password":"a"}');

		await installer.sync(repl, { components: [], files: [secret('{"ssid":"Home","password":"b"}')] }, silent);
		expect(fs.readFileSync(path.join(board.sandbox, "secrets", "cred-1.json"), "utf8")).toBe('{"ssid":"Home","password":"b"}');

		await installer.sync(repl, { components: [], files: [] }, silent);
		await repl.close(false);
		expect(boardFiles().filter(file => file.startsWith("/secrets/") && !file.endsWith(".index.json"))).toEqual([]);
	}, 60000);

	test("a file anywhere but /files and /secrets is refused", async () => {
		const repl = await openFake(board);
		const data = new Uint8Array([1]);
		const sha256 = createHash("sha256").update(data).digest("hex");
		await expect(installer.sync(repl, { components: [], files: [{ path: "/main.py", sha256, data }] }, silent)).rejects.toThrow("not a place");
		await expect(installer.sync(repl, { components: [], files: [{ path: "/files/../main.py", sha256, data }] }, silent)).rejects.toThrow("not a place");
		await repl.close(false);
	}, 60000);

	test("a file whose data doesn't match its sha256 is refused", async () => {
		const repl = await openFake(board);
		await expect(installer.sync(repl, { components: [], files: [{ path: "/files/x.bin", sha256: "0".repeat(64), data: new Uint8Array([1]) }] }, silent))
			.rejects.toThrow("doesn't match");
		await repl.close(false);
	}, 60000);

	test("a board that doesn't import .mpy v6 gets the source — and the runtime registers the action", async () => {
		const repl = await openFake(board);
		await repl.exec("import sys\nsys.implementation._mpy = 5");
		await installer.sync(repl, { components: [GPIO_WRITE], files: [] }, silent);
		expect(boardFiles()).toContain("/components/gpio/write.py");

		// The runtime's own loader, as when the session's first frame starts it.
		const loaded = await repl.exec([
			"import sys",
			`sys.path.insert(0, ${JSON.stringify(board.sandbox.replaceAll("\\", "/"))})`,
			"from hio.system.core.services.ComponentLoader import ComponentLoader",
			"from hio.sdk.core import registry",
			"from hio.sdk.core.identifier import generate_id",
			"print(ComponentLoader('/components').load(), registry.find(generate_id('gpio/write')) is not None)",
		].join("\n"));
		await repl.close(false);

		expect(loaded.trim()).toBe("['gpio/write'] True");
	}, 60000);

});
