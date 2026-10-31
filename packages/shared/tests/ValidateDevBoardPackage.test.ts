import { DirectoryLint, type GenerateSchema } from "directory-lint";
import { PackageService } from "../src/index.js";
import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { rm } from "fs/promises";

// The source layout board packages use in this repo: everything under workspace/.
const DEV_BOARD_STRUCTURE = {
	workspace: {
		type: "directory",
		children: {
			"board.schema.yaml": { type: "file", content: "name: Test\ndescription: Test board\n" },
			"manifest.yaml": { type: "file", content: "kind: board\nname: Test Board\nschemaVersion: 1\ndependences:\n  platform: ^2.0.0\nui:\n  schema: ./board.schema.yaml\nfirmware:\n  micropython: 1.29.0\n  image: https://example.com/fw.bin\n  flash:\n    chip: esp32\n    offset: \"0x1000\"\n" },
		},
	},
} as const satisfies GenerateSchema;

let devBoardPackagePath = "";

describe("Validate dev board package", () => {
	beforeAll(async () => {
		const lint = new DirectoryLint();
		devBoardPackagePath = path.join(tmpdir(), `valid_dev_board_package_${Date.now()}`);
		await lint.generate(devBoardPackagePath, DEV_BOARD_STRUCTURE, { recursive: true });
	});

	afterAll(async () => {
		await rm(devBoardPackagePath, { recursive: true, force: true });
	});

	test("a board with its manifest under workspace/ resolves to workspace/", async () => {
		const result = await new PackageService().validate(devBoardPackagePath);
		expect(result?.kind).toBe("board");
		expect(result?.path).toBe(path.join(devBoardPackagePath, "workspace"));
	});
});
