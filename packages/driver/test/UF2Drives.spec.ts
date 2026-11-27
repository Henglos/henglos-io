import "reflect-metadata";      // the services are tsyringe @injectable()s
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, test } from "vitest";

import { UF2Drives } from "../src/daemon/application/services/UF2Drives.service.js";

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true }); });

// The drives a test says are mounted — list() is the OS's, stubbed.
class StubDrives extends UF2Drives {
	constructor(private readonly mounted: { label: string; mount: string }[]) { super(); }
	override async list() { return this.mounted; }
}

describe("UF2Drives.find", () => {

	test("a path that exists is taken as it is", async () => {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), "uf2-"));
		folders.push(folder);
		expect(await new StubDrives([]).find(folder)).toBe(folder);
	});

	test("a path that doesn't exist isn't there", async () => {
		expect(await new StubDrives([]).find(path.join(os.tmpdir(), "no-such-drive-here"))).toBeNull();
	});

	test("anything else is a label, looked up among the mounted drives", async () => {
		const drives = new StubDrives([{ label: "RPI-RP2", mount: "E:\\" }, { label: "USB", mount: "F:\\" }]);
		expect(await drives.find("RPI-RP2")).toBe("E:\\");
		expect(await drives.find("RP2350")).toBeNull();
	});

});
