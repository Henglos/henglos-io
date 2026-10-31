import { describe, expect, it } from "vitest";
import { checkPatterns, PARAM_PATTERN_NAMES, SIMPLE_PATTERN_NAMES, SIMPLE_PATTERNS } from "./registry.js";
import { ComponentSchema } from "../domain/entities/IComponent.schema.js";
import { PatternSchema } from "../domain/entities/IConfiguration.schema.js";
import { ConfigurationParser } from "../application/services/ConfigurationParser.service.js";
import type { IConfigurationSchema } from "../domain/entities/IConfiguration.schema.js";

const config = (extra: Record<string, unknown>, type = "string") =>
	({ displayName: "X", description: "", type, ...extra }) as unknown as IConfigurationSchema;

describe("config patterns", () => {

	it("every named filter compiles", () => {
		for (const name of SIMPLE_PATTERN_NAMES) expect(() => new RegExp(SIMPLE_PATTERNS[name].regex)).not.toThrow();
		expect(PARAM_PATTERN_NAMES).toEqual(["MaxLength", "MinLength", "ExactLength", "Max", "Min"]);
	});

	it("accepts names, parametrized filters and custom regexes in a manifest — and rejects unknown ones", () => {
		expect(PatternSchema.safeParse("IPv4").success).toBe(true);
		expect(PatternSchema.safeParse({ name: "MaxLength", value: 16 }).success).toBe(true);
		expect(PatternSchema.safeParse({ regex: "^[a-z]+$", message: "lower" }).success).toBe(true);

		expect(PatternSchema.safeParse("IPV4").success).toBe(false);
		expect(PatternSchema.safeParse({ name: "MaxLength" }).success).toBe(false);
		expect(PatternSchema.safeParse({ regex: "([" }).success).toBe(false);

		const manifest = ComponentSchema.safeParse({
			displayName: "Wifi",
			description: "",
			actions: [{
				displayName: "Connect",
				description: "",
				script: "connect.py",
				configurations: [{
					displayName: "SSID",
					description: "",
					type: "string",
					patterns: ["AlphanumericDash", { name: "MaxLength", value: 32 }],
				}],
			}],
		});
		expect(manifest.success).toBe(true);
	});

	it("combines filters with all (default) or any", () => {
		const ssid = ["AlphanumericUnderscore", { name: "MaxLength", value: 5 }] as const;
		expect(checkPatterns("abc_1", [...ssid])).toBeNull();
		expect(checkPatterns("abc_12", [...ssid])).toBe("At most 5 characters.");
		expect(checkPatterns("ab c", [...ssid])).toBe("Letters, digits and _ only.");

		const address = ["IPv4", "Url"] as const;
		expect(checkPatterns("192.168.0.1", [...address], "any")).toBeNull();
		expect(checkPatterns("example.com", [...address], "any")).toBeNull();
		expect(checkPatterns("nope", [...address], "any")).toBe("Must match one of: IPv4, Url.");
	});

	it("counts characters, not UTF-16 units, and leaves empty values to `required`", () => {
		expect(checkPatterns("ação", [{ name: "MaxLength", value: 4 }])).toBeNull();
		expect(checkPatterns("", ["Email"])).toBeNull();
	});

	it("checks numbers against the evaluated expression", () => {
		const percent = config({ patterns: [{ name: "Min", value: 0 }, { name: "Max", value: 100 }] }, "number");
		expect(ConfigurationParser.validate(percent, "50 * 2")).toBeNull();
		expect(ConfigurationParser.validate(percent, "101")).toBe("At most 100.");
		expect(ConfigurationParser.validate(percent, "-1")).toBe("At least 0.");
		expect(ConfigurationParser.validate(percent, "abc")).toBe("Not a number or expression.");
		const [, value, ok] = ConfigurationParser.parse("40 + 2", ConfigurationParser.pipesFor(percent));
		expect([value, ok]).toEqual([42, true]);
	});

	it("uses a custom regex's own message — also to name it among alternatives", () => {
		const custom = config({ patterns: [{ regex: "^[a-z]", message: "Must start lowercase." }] });
		expect(ConfigurationParser.validate(custom, "Abc")).toBe("Must start lowercase.");
		const either = [{ regex: "^[0-9a-f]+$", message: "Hex." }, { regex: "^[A-Z]+$", message: "Capitals." }];
		expect(checkPatterns("x!", either, "any")).toBe("Must match one of: Hex, Capitals.");
	});
});
