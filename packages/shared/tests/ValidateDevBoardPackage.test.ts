import { DirectoryLint, type GenerateSchema } from "directory-lint";
import { PackageService } from "../src/index.js";
import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { rm } from "fs/promises";

const MANIFEST = "kind: board\nname: Test Board\nschemaVersion: 1\ndependences:\n  platform: ^2.0.0\nui:\n  schema: ./hardware/board.schema.yaml\nfirmware:\n  micropython: 1.29.0\n  image: test/workbench:1\n  script: ./src/firmware.ts\n";
const SCHEMA = { type: "file", content: "name: Test\ndescription: Test board\n" } as const;
const SCRIPT = { type: "file", content: "export default {};\n" } as const;

// The manifest at the root; the rest in whatever folders it names.
const STRUCTURE = {
	any: {
		type: "directory",
		children: {
			"manifest.yaml": { type: "file", content: MANIFEST },
			hardware: { type: "directory", children: { "board.schema.yaml": SCHEMA } },
			src: { type: "directory", children: { "firmware.ts": SCRIPT } },
		},
	},
	nested: {
		type: "directory",
		children: {
			workspace: { type: "directory", children: { "manifest.yaml": { type: "file", content: MANIFEST } } },
		},
	},
	outside: {
		type: "directory",
		children: {
			"manifest.yaml": { type: "file", content: MANIFEST.replace("./src/firmware.ts", "../firmware.ts") },
		},
	},
} as const satisfies GenerateSchema;

let root = "";

describe("A board package's folders", () => {
	beforeAll(async () => {
		root = path.join(tmpdir(), `board_package_folders_${Date.now()}`);
		await new DirectoryLint().generate(root, STRUCTURE, { recursive: true });
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test("its files can be in any folder the manifest names", async () => {
		const result = await new PackageService().validate(path.join(root, "any"));
		expect(result?.kind).toBe("board");
		expect(result?.path).toBe(path.join(root, "any"));
	});

	test("its manifest must be at the root", async () => {
		expect(await new PackageService().validate(path.join(root, "nested"))).toBeNull();
	});

	test("its script can't be outside the package", async () => {
		expect(await new PackageService().validateBoard(path.join(root, "outside"))).toBeNull();
	});
});
