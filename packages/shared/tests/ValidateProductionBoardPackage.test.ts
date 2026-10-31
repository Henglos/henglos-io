import { DirectoryLint, type GenerateSchema } from "directory-lint";
import { PackageService } from "../src/index.js";
import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { rm } from "fs/promises";

// A board is hardware only: pins and the MicroPython firmware it runs.
const BOARD_MANIFEST = "kind: board\nname: Test Board\nschemaVersion: 1\ndependences:\n  platform: ^2.0.0\nui:\n  schema: ./board.schema.yaml\nfirmware:\n  micropython: 1.29.0\n  image: https://example.com/fw.bin\n  flash:\n    chip: esp32\n    offset: \"0x1000\"\n";

// The platform carries the build.
const PLATFORM_MANIFEST = "kind: platform\nname: HenglosIO\nschemaVersion: 1\nversion: 2.1.0\nbuild:\n  image:\n    name: test/workbench:1\n  script: ./build/build.js\n  output: /workspace/build\n";

const BOARD_STRUCTURE = {
	"manifest.yaml": { type: "file", content: BOARD_MANIFEST },
	"board.schema.yaml": { type: "file", content: "name: Test\ndescription: Test\n" },
} as const satisfies GenerateSchema;

const PLATFORM_STRUCTURE = {
	build: { type: "directory", children: { "build.js": { type: "file", content: "" } } },
	hio: { type: "directory", children: { "__init__.py": { type: "file", content: "" } } },
	"manifest.yaml": { type: "file", content: PLATFORM_MANIFEST },
} as const satisfies GenerateSchema;

const COMPONENT_STRUCTURE = {
	src: { type: "directory", children: { "write.py": { type: "file", content: "" } } },
	"manifest.yaml": { type: "file", content: "kind: component\nname: GPIO\nschemaVersion: 1\ndependences:\n  platform: ^2.0.0\nschema: {}\n" },
} as const satisfies GenerateSchema;

let root = "";

describe("Validate packages", () => {

	beforeAll(async () => {
		root = path.join(tmpdir(), `hio_packages_${Date.now()}`);
		const lint = new DirectoryLint();
		await lint.generate(path.join(root, "board"), BOARD_STRUCTURE, { recursive: true });
		await lint.generate(path.join(root, "platform"), PLATFORM_STRUCTURE, { recursive: true });
		await lint.generate(path.join(root, "component"), COMPONENT_STRUCTURE, { recursive: true });
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test("a board package resolves to its manifest's folder, with its firmware", async () => {
		const result = await new PackageService().validateBoard(path.join(root, "board"));
		expect(result?.path).toBe(path.join(root, "board"));
		expect(result?.firmware).toEqual({ micropython: "1.29.0", image: "https://example.com/fw.bin", flash: { chip: "esp32", offset: "0x1000" } });
	});

	test("a platform package carries its build", async () => {
		const result = await new PackageService().validate(path.join(root, "platform"));
		expect(result?.kind).toBe("platform");
		expect(result?.path).toBe(path.join(root, "platform"));
	});

	test("a platform whose build script is missing is invalid", async () => {
		await rm(path.join(root, "platform", "build", "build.js"));
		expect(await new PackageService().validatePlatform(path.join(root, "platform"))).toBeNull();
	});

	test("a component package with its manifest at the root", async () => {
		const result = await new PackageService().validateComponent(path.join(root, "component"));
		expect(result?.name).toBe("GPIO");
		expect(result?.path).toBe(path.join(root, "component"));
	});

	test("a folder without a manifest is not a package", async () => {
		expect(await new PackageService().validate(path.join(root, "nope"))).toBeNull();
	});
});
