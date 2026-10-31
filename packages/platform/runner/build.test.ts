import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { applySettings, resolveSettings, type PlatformRule, type PlatformSetting } from "./build";

const root = path.join(import.meta.dir, "..");
const read = (file: string) => readFileSync(path.join(root, "hio", file), "utf-8");
const manifest = parseYaml(readFileSync(path.join(root, "manifest.yaml"), "utf-8")) as { settings: PlatformSetting[]; rules: PlatformRule[] };
const resolve = (overrides: Record<string, number>) => resolveSettings(overrides, manifest.settings, manifest.rules);

const SYSTEM_CONFIG = "system/SystemConfig.py";
const PACKET_CODEC = "system/core/services/PacketCodec.py";

describe("platform settings", () => {

	it("rewrites SystemConfig's const() values, only on their lines", () => {
		const source = read(SYSTEM_CONFIG);
		const patched = applySettings(source, SYSTEM_CONFIG, resolve({ MAX_VARIABLES: 64, STREAM_TIMEOUT_MS: 5000 }).values);
		expect(patched).toContain("MAX_VARIABLES = const(64)");
		expect(patched).toContain("STREAM_TIMEOUT_MS = const(5000)");
		expect(patched).toContain("MAX_CONTEXT_ENTRIES = const(16)");
		expect(patched.split("\n").length).toBe(source.split("\n").length);
	});

	it("rewrites PacketCodec's plain values and keeps their trailing comments", () => {
		const values = resolve({ MAX_PACKET_SIZE: 512, MAX_DATA_BUFFER: 128, MAX_FRAME_CONTENT: 1024 }).values;
		const patched = applySettings(read(PACKET_CODEC), PACKET_CODEC, values);
		expect(patched).toMatch(/^MAX_PACKET_SIZE = 512\s+# upper bound for LEN$/m);
		expect(patched).toMatch(/^MAX_DATA_BUFFER = 128\s+# one resolved config value/m);
		// Derived limits follow on their own.
		expect(patched).toContain("MAX_PAYLOAD_SIZE = MAX_PACKET_SIZE - 3 - 2");
		// Each file only gets its own keys.
		expect(applySettings(read(SYSTEM_CONFIG), SYSTEM_CONFIG, values)).toContain("MAX_FRAME_CONTENT = const(1024)");
		expect(applySettings(read(SYSTEM_CONFIG), SYSTEM_CONFIG, values)).not.toContain("MAX_PACKET_SIZE");
	});

	it("checks the rules between limits, with the overrides applied over the defaults", () => {
		// A bigger packet needs a bigger receive buffer…
		expect(() => resolve({ MAX_PACKET_SIZE: 2048 })).toThrow(/receive buffer/);
		expect(() => resolve({ MAX_PACKET_SIZE: 2048, MAX_FRAME_CONTENT: 2100 })).not.toThrow();
		// …and a value must still fit in one packet.
		expect(() => resolve({ MAX_DATA_BUFFER: 1100 })).toThrow(/at most Packet size − 17/);
		expect(() => resolve({ MAX_DATA_BUFFER: 1100, MAX_PACKET_SIZE: 2048, MAX_FRAME_CONTENT: 2100 })).not.toThrow();
		// The defaults satisfy every rule.
		expect(() => resolve({})).not.toThrow();
	});

	it("skips keys this platform doesn't declare and refuses values out of range", () => {
		expect(resolve({ NOT_A_SETTING: 3 }).skipped).toEqual(["NOT_A_SETTING"]);
		expect(() => resolve({ MAX_VARIABLES: 9999 })).toThrow(/out of range/);
		expect(() => resolve({ MAX_VARIABLES: 1.5 })).toThrow(/out of range/);
	});
});
