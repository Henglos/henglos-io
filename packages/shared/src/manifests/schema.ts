import zod from "zod";
import { BoardOptionSchema } from "@henglosio/workflow";

// ── Platform manifest ─────────────────────────────────────────────────────────

// A limit a workflow may override — `key` is the constant the platform's
// build rewrites to the workflow's value before compiling, assigned in `file`
// (under hio/, default system/SystemConfig.py). Protocol limits (PacketCodec.py)
// are read by the host too — @henglosio/workflow's protocolLimits — so both
// sides of the link always agree.
export const PlatformSettingSchema = zod.object({
	key: zod.string().regex(/^[A-Z][A-Z0-9_]*$/),
	displayName: zod.string().min(1),
	description: zod.string(),
	group: zod.string().optional(),
	file: zod.string().optional(),
	type: zod.literal("integer"),
	default: zod.number().int(),
	min: zod.number().int(),
	max: zod.number().int(),
	unit: zod.string().optional(),
}).refine(setting => setting.min <= setting.default && setting.default <= setting.max, "default must be within [min, max]");

// A limit a workflow may override — `key` is the constant the platform's
// build rewrites to the workflow's value before compiling, assigned in `file`
// (under hio/, default system/SystemConfig.py). Protocol limits (PacketCodec.py)
// are read by the host too — @henglosio/workflow's protocolLimits — so both
// sides of the link always agree.
export type PlatformSetting = zod.infer<typeof PlatformSettingSchema>;

// Ties one limit to another (with the overrides applied): `key` must be
// at least / at most `other + plus`, e.g. the receive buffer must hold a whole
// packet. Checked by the platform's build and by the studio.
export const PlatformRuleSchema = zod.union([
	zod.object({ key: zod.string(), atLeast: zod.string(), plus: zod.number().int().default(0), message: zod.string() }),
	zod.object({ key: zod.string(), atMost: zod.string(), plus: zod.number().int().default(0), message: zod.string() }),
]);

// Ties one limit to another (with the overrides applied): `key` must be
// at least / at most `other + plus`, e.g. the receive buffer must hold a whole
// packet. Checked by the platform's build and by the studio.
export type PlatformRule = zod.infer<typeof PlatformRuleSchema>;

/**
 * Every problem with `overrides` against what a platform declares — out of
 * range, or a broken rule — by the key to show it on. Empty when the build
 * will accept them. Keys the platform doesn't declare are ignored (the build
 * skips them too).
 */
export const checkPlatformSettings = (settings: PlatformSetting[], rules: PlatformRule[], overrides: Record<string, unknown>): Record<string, string> => {
	const problems: Record<string, string> = {};
	const effective: Record<string, number> = {};

	for (const setting of settings) {
		const value = overrides[setting.key];
		if (value === undefined) {
			effective[setting.key] = setting.default;
			continue;
		}
		const error = platformSettingError(setting, value);
		if (error) problems[setting.key] = error;
		else effective[setting.key] = value as number;
	}

	for (const rule of rules) {
		const other = "atLeast" in rule ? rule.atLeast : rule.atMost;
		const value = effective[rule.key];
		const bound = effective[other];
		if (value === undefined || bound === undefined || problems[rule.key]) continue;
		const limit = bound + rule.plus;
		const broken = "atLeast" in rule ? value < limit : value > limit;
		if (broken) problems[rule.key] = `${rule.message} (${rule.key} = ${value}, needs ${"atLeast" in rule ? "≥" : "≤"} ${limit})`;
	}

	return problems;
};

/** Why `value` can't be `setting`'s override, or null when it can. */
export const platformSettingError = (setting: PlatformSetting, value: unknown): string | null => {
	if (typeof value !== "number" || !Number.isInteger(value)) return `${setting.key} must be a whole number.`;
	if (value < setting.min || value > setting.max) return `${setting.key} must be between ${setting.min} and ${setting.max}.`;
	return null;
};

// The platform is the runtime (hio/**/*.py) and knows how to build itself:
// `build` is its Runner (`script`), run in the board's image — build compiles
// the runtime and the workflow's components for the board's firmware version
// into `output` (which the driver uploads); flash writes the board's firmware.
export const PlatformManifestSchema = zod.object({
	kind: zod.literal("platform"),
	name: zod.string(),
	schemaVersion: zod.number().int().positive(),
	version: zod.string(),
	build: zod.object({
		script: zod.string(),
		output: zod.string(),
	}),
	// What a workflow can override at build time — see PlatformSettingSchema.
	settings: zod.array(PlatformSettingSchema).optional(),
	rules: zod.array(PlatformRuleSchema).optional(),
});

// ── Component manifest ────────────────────────────────────────────────────────

// No `build` field — components don't compile into the firmware. Every action
// is a MicroPython module (its `script`, relative to the package root) that
// the platform's build compiles to .mpy and the driver uploads as a file.
export const ComponentManifestSchema = zod.object({
	kind: zod.literal("component"),
	name: zod.string(),
	schemaVersion: zod.number().int().positive(),
	dependences: zod.object({
		platform: zod.string(),
		// What its actions need of the board — wifi, bluetooth… (checked
		// against @henglosio/workflow's CAPABILITIES when its schema is read).
		capabilities: zod.array(zod.string()).optional(),
	}),
	// Opaque on purpose — the actual shape (displayName/actions/configurations/
	// ...) is @henglosio/workflow's ComponentSchema, not shared's. Keeping it
	// untyped here avoids shared depending on workflow just to pass this blob
	// through; callers that need it typed re-parse manifest.schema themselves
	// (see PackageRegistryService.fetchPackage).
	schema: zod.unknown(),
});

// ── Board manifest ────────────────────────────────────────────────────────────

// A board is its pins (`ui.schema`) and how to get MicroPython onto it — see
// BoardFirmware (@henglosio/runner), the script's contract.
export const BoardFirmwareSchema = zod.object({
	// The MicroPython version the board runs: what the runtime and the
	// components compile for (a .mpy only imports on that version).
	micropython: zod.string(),
	// The Docker image the build and the flash run in. Any image with Node 24+,
	// `hio` and Python 3 with pip — the official ones are henglosio/workbench-*.
	image: zod.string().min(1),
	// The TypeScript file that builds and writes the firmware, in any folder of
	// the package (relative to this manifest).
	script: zod.string().regex(/\.ts$/, "must be a .ts file").refine(script => !script.split(/[\\/]/).includes(".."), "must be inside the package"),
});

/** A board package's manifest.yaml. */
export const BoardManifestSchema = zod.object({
	kind: zod.literal("board"),
	name: zod.string(),
	schemaVersion: zod.number().int().positive(),
	dependences: zod.object({
		platform: zod.string(),
	}),
	ui: zod.object({
		schema: zod.string(),
	}),
	firmware: BoardFirmwareSchema,
	// The parameters of its firmware: the studio shows a form, and the firmware
	// script gets the values picked. Not for secrets.
	options: zod.array(BoardOptionSchema).optional(),
	// What it offers besides its pins — wifi, bluetooth… Absent: not said
	// (nothing is checked against it).
	capabilities: zod.array(zod.string()).optional(),
});

// ── Union ─────────────────────────────────────────────────────────────────────

export const ManifestSchema = zod.discriminatedUnion("kind", [
	PlatformManifestSchema,
	ComponentManifestSchema,
	BoardManifestSchema,
]);
