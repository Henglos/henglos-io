import "reflect-metadata";      // the services are tsyringe @injectable()s
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SerialPortMock } from "serialport";

import { BoardFilesUseCase } from "../src/daemon/application/use-cases/fs/BoardFiles.use-case.js";
import type { TaskContext } from "../src/daemon/domain/entities/TaskContext.js";
import { FakeBoard, openFake } from "./support/FakeBoard.js";

const ctx = { signal: new AbortController().signal } as unknown as TaskContext;

let board: FakeBoard;
let files: BoardFilesUseCase;

const put = (boardPath: string, data: string | Buffer) => {
	const file = path.join(board.sandbox, boardPath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, data);
};

describe("BoardFilesUseCase", () => {

	beforeEach(() => {
		SerialPortMock.binding.createPort("/dev/fake");
		board = new FakeBoard(fs.mkdtempSync(path.join(os.tmpdir(), "hio-fake-board-")));
		files = new BoardFilesUseCase();
		files.open = () => openFake(board);
	});

	afterEach(() => {
		board.stop();
		SerialPortMock.binding.reset();
		fs.rmSync(board.sandbox, { recursive: true, force: true });
	});

	test("list: the tree from /, folders first, with sizes — and the space", async () => {
		put("main.py", "print('hi')\n");
		put("boot.py", "");
		put("components/display/print.mpy", Buffer.alloc(300));
		put("components/display/oled.mpy", Buffer.alloc(1200));
		put("files/abc123.pbm", Buffer.alloc(10));

		const out = await files.list("/dev/fake", ctx);

		expect(out.total).toBe(4096 * 256);
		expect(out.free).toBe(4096 * 128);
		expect(out.tree.map(e => e.name)).toEqual(["components", "files", "boot.py", "main.py"]);
		const display = out.tree[0]!.children![0]!;
		expect(display).toMatchObject({ name: "display", dir: true });
		expect(display.children).toEqual([
			{ name: "oled.mpy", dir: false, size: 1200 },
			{ name: "print.mpy", dir: false, size: 300 },
		]);
		expect(out.tree.find(e => e.name === "main.py")).toEqual({ name: "main.py", dir: false, size: 12 });
		expect(board.resets).toBe(1);                 // closed with a soft reset: the program plays again
	});

	test("read: a file's bytes, base64 — binary too", async () => {
		const bytes = Buffer.from([0, 1, 2, 250, 255, 10, 13]);
		put("hio/data.bin", bytes);
		put("main.py", "import hio\nhio.start()\n");

		expect(await files.read("/dev/fake", "/main.py", ctx)).toEqual({
			path: "/main.py", size: 23, data: Buffer.from("import hio\nhio.start()\n").toString("base64"), truncated: false,
		});
		const binary = await files.read("/dev/fake", "/hio/data.bin", ctx);
		expect(Buffer.from(binary.data, "base64")).toEqual(bytes);
	});

	const exists = (boardPath: string) => fs.existsSync(path.join(board.sandbox, boardPath));
	const contents = (boardPath: string) => fs.readFileSync(path.join(board.sandbox, boardPath), "utf8");
	const names = (tree: { name: string }[]) => tree.map(e => e.name);

	test("write: a new file in folders that don't exist yet, then over it — and the tree after", async () => {
		const out = await files.write("/dev/fake", "/lib/util/math.py", new TextEncoder().encode("x = 1\n"), ctx);
		expect(contents("/lib/util/math.py")).toBe("x = 1\n");
		expect(out.tree[0]).toMatchObject({ name: "lib", dir: true, children: [{ name: "util", dir: true }] });

		await files.write("/dev/fake", "/lib/util/math.py", new TextEncoder().encode("x = 2\n"), ctx);
		expect(contents("/lib/util/math.py")).toBe("x = 2\n");
	});

	test("write: never over a folder", async () => {
		put("lib/a.py", "");
		await expect(files.write("/dev/fake", "/lib", new Uint8Array([1]), ctx)).rejects.toThrow(/folder has that name/);
		expect(contents("/lib/a.py")).toBe("");
	});

	test("delete: a file, and a folder with everything in it", async () => {
		put("main.py", "");
		put("lib/a.py", "");
		put("lib/deep/b.py", "");

		expect(names((await files.remove("/dev/fake", "/main.py", ctx)).tree)).toEqual(["lib"]);
		expect(names((await files.remove("/dev/fake", "/lib", ctx)).tree)).toEqual([]);
		expect(exists("/lib")).toBe(false);
	});

	test("mkdir: with its parents; an existing one is fine", async () => {
		await files.mkdir("/dev/fake", "/data/logs", ctx);
		expect(fs.statSync(path.join(board.sandbox, "data/logs")).isDirectory()).toBe(true);
		await expect(files.mkdir("/dev/fake", "/data/logs", ctx)).resolves.toBeTruthy();
	});

	test("rename: in place, and as a move into another folder — never over something", async () => {
		put("a.py", "A");
		put("b.py", "B");

		await files.rename("/dev/fake", "/a.py", "/c.py", ctx);
		expect(contents("/c.py")).toBe("A");
		expect(exists("/a.py")).toBe(false);

		await files.rename("/dev/fake", "/c.py", "/lib/c.py", ctx);
		expect(contents("/lib/c.py")).toBe("A");

		await expect(files.rename("/dev/fake", "/b.py", "/lib/c.py", ctx)).rejects.toThrow(/already exists/);
		expect(contents("/b.py")).toBe("B");
		await expect(files.rename("/dev/fake", "/nope.py", "/x.py", ctx)).rejects.toThrow(/no such file/);
		await expect(files.rename("/dev/fake", "/lib", "/lib/inner", ctx)).rejects.toThrow(/into itself/);
	});

	test("paths: only clean board paths, and never the root", async () => {
		await expect(files.remove("/dev/fake", "/", ctx)).rejects.toThrow(/root/);
		await expect(files.remove("/dev/fake", "/lib/../..", ctx)).rejects.toThrow(/Not a board path/);
		await expect(files.write("/dev/fake", "main.py", new Uint8Array(), ctx)).rejects.toThrow(/Not a board path/);
	});

	test("read: a file past the cap comes back cut, marked truncated", async () => {
		const big = Buffer.alloc(140 * 1024, 7);
		put("big.bin", big);

		const out = await files.read("/dev/fake", "/big.bin", ctx);

		expect(out.size).toBe(big.length);
		expect(out.truncated).toBe(true);
		expect(Buffer.from(out.data, "base64").length).toBe(128 * 1024);
	});

});
