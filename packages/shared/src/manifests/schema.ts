import zod from "zod";

// ── Build image ─────────────────────────────────────────────────────────────────

/** A container image — the platform's build image — and the registry credentials to pull it. */
export const ImageRefSchema = zod.object({

	name: zod.string(),
	registry: zod.string().optional(),
	username: zod.string().optional(),
	password: zod.string().optional()

})

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
// `build` is its container (`image`) and Runner (`script`) — build compiles
// the runtime and the workflow's components for the board's firmware version
// into `output` (which the driver uploads); flash writes the board's firmware.
export const PlatformManifestSchema = zod.object({
	kind: zod.literal("platform"),
	name: zod.string(),
	schemaVersion: zod.number().int().positive(),
	version: zod.string(),
	build: zod.object({
		image: ImageRefSchema,
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

// A board is hardware only, no code: its pins (`ui.schema`) and the
// MicroPython firmware it runs — the port's official image, and how to write
// it. `firmware.micropython` is also what the platform's build compiles for
// (a .mpy only imports on the MicroPython version it was compiled for).
//
// No `limits`: frame/config ceilings are the runtime's, fixed in PacketCodec.py
// and mirrored by @henglosio/shared's packet.ts — not per board anymore.
export const BoardFirmwareSchema = zod.object({
	// MicroPython version of `image`, e.g. "1.29.0".
	micropython: zod.string(),
	// The port's firmware image (URL), e.g. ESP32_GENERIC-...-v1.29.0.bin.
	image: zod.string(),
	flash: zod.object({
		// esptool's --chip.
		chip: zod.string(),
		// Where `image` is written, e.g. "0x1000" (ESP32) or "0x0" (ESP32-S3).
		offset: zod.string(),
	}),
	// How to build the board's MicroPython from source — the platform freezes
	// its runtime into it, so the code runs from flash instead of RAM. Without
	// it, the board runs `image` and the runtime goes on its filesystem as .mpy.
	build: zod.object({
		// MicroPython's port (ports/<port>), e.g. "esp32".
		port: zod.string(),
		// Its board (ports/<port>/boards/<board>), e.g. "ESP32_GENERIC".
		board: zod.string(),
		// The ESP-IDF to build with, e.g. "v5.4.2" — by default, the one
		// MicroPython's CI builds that version with.
		idf: zod.string().optional(),
	}).optional(),
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
