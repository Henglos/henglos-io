import zod from "zod";
import { PinSchema } from "./IPin.schema.js";
import { ConfigurationSchema } from "./IConfiguration.schema.js";
import { CapabilitySchema } from "../value-objects/Capabilities.js";

/** A way the board's firmware can be written — @henglosio/shared's FlashMethodNameSchema. */
export const BoardFlashMethodSchema = zod.enum(["serial", "uf2"]);

/** A serial baud rate the board's link can use. */
export const BaudRateSchema = zod.union([
	zod.literal(110),
	zod.literal(300),
	zod.literal(600),
	zod.literal(1200),
	zod.literal(2400),
	zod.literal(4800),
	zod.literal(9600),
	zod.literal(14400),
	zod.literal(19200),
	zod.literal(28800),
	zod.literal(38400),
	zod.literal(57600),
	zod.literal(115200),
	zod.literal(128000),
	zod.literal(230400),
	zod.literal(256000),
	zod.literal(460800),
	zod.literal(500000),
	zod.literal(576000),
	zod.literal(921600),
	zod.literal(1000000),
	zod.literal(1500000),
	zod.literal(2000000),
	zod.literal(2500000),
	zod.literal(3000000),
	zod.literal(3500000),
	zod.literal(4000000),
	zod.literal(4500000),
	zod.literal(6000000),
	zod.literal(12000000),
]);

/** How a board talks over serial: the baud rates it can use, the first one the default. */
export const SerialConnectionSchema = zod.object({
	baudrates: zod.array(BaudRateSchema).min(1),
}).strict();

/** How a board talks over Wi-Fi: its default network and host. */
export const WifiConnectionSchema = zod.object({
	defaultSsid: zod.string().min(1),
	defaultPassword: zod.string(),
	defaultHost: zod.string().min(1),
	defaultPort: zod.number().int().min(1).max(65535),
}).strict();

/** How the driver can reach a board — serial, Wi-Fi, or both. */
export const BoardConnectionSchema = zod.object({
	serial: SerialConnectionSchema.optional(),
	wifi: WifiConnectionSchema.optional(),
}).refine((data) => data.serial || data.wifi, {
	message: "connection must have at least serial or wifi",
});

/** The serial link picked: its baud rate and port. */
export const SerialConnectionStateSchema = zod.object({
	baudrate: BaudRateSchema,
	port: zod.string(),
}).strict();

/** The Wi-Fi link picked: its network and host. */
export const WifiConnectionStateSchema = zod.object({
	ssid: zod.string(),
	password: zod.string(),
	host: zod.string(),
	port: zod.number().int().min(1).max(65535),
}).strict();

/** A way the board's firmware can be written. */
export type IBoardFlashMethod = zod.infer<typeof BoardFlashMethodSchema>;
/** The link picked for a workflow's board. */
export const BoardConnectionStateSchema = zod.object({
	serial: SerialConnectionStateSchema.optional(),
	wifi: WifiConnectionStateSchema.optional(),
}).refine((data) => data.serial || data.wifi, {
	message: "connection state must have at least serial or wifi",
});

/**
 * What changing an option redoes — `prepare`: the firmware's environment
 * (toolchains), then a build and a flash; `build` (the default): a build and a
 * flash; `runtime`: nothing — the value goes to the board with the session
 * (/hio_settings.json), where components read it.
 */
export const BoardOptionScopeSchema = zod.enum(["prepare", "build", "runtime"]);
export type BoardOptionScope = zod.infer<typeof BoardOptionScopeSchema>;

const BoardOptionBase = {
	key: zod.string().regex(/^[A-Z][A-Z0-9_]*$/),
	displayName: zod.string().min(1),
	description: zod.string(),
	scope: BoardOptionScopeSchema.optional(),
};

/** An option's scope — `build` when it doesn't say. */
export const boardOptionScope = (option: { scope?: BoardOptionScope }): BoardOptionScope => option.scope ?? "build";

const BoardOptionShape = zod.discriminatedUnion("type", [
	zod.object({ ...BoardOptionBase, type: zod.literal("integer"), default: zod.number().int(), min: zod.number().int(), max: zod.number().int() }).strict(),
	zod.object({ ...BoardOptionBase, type: zod.literal("boolean"), default: zod.boolean() }).strict(),
	zod.object({ ...BoardOptionBase, type: zod.literal("select"), default: zod.string(), choices: zod.array(zod.string().min(1)).min(1) }).strict(),
]);

/** A parameter of a board's firmware — the studio asks for it, the board's firmware script reads it. */
export type IBoardOption = zod.infer<typeof BoardOptionShape>;
/** What a workflow picked for a board's option. */
export type BoardOptionValue = string | number | boolean;

/** Why `value` can't be `option`'s value, or null when it can. */
export const boardOptionError = (option: IBoardOption, value: unknown): string | null => {
	switch (option.type) {
		case "integer":
			if (typeof value !== "number" || !Number.isInteger(value)) return `${option.key} must be a whole number.`;
			if (value < option.min || value > option.max) return `${option.key} must be between ${option.min} and ${option.max}.`;
			return null;
		case "boolean":
			return typeof value === "boolean" ? null : `${option.key} must be true or false.`;
		case "select":
			return typeof value === "string" && option.choices.includes(value) ? null : `${option.key} must be one of: ${option.choices.join(", ")}.`;
	}
};

export const BoardOptionSchema = BoardOptionShape.superRefine((option, ctx) => {
	const error = boardOptionError(option, option.default);
	if (error) ctx.addIssue({ code: "custom", path: ["default"], message: error });
});

/**
 * The value of each of a board's options, as the firmware script gets them: what
 * the workflow picked, or the default. Keys the board doesn't declare are left
 * out — the workflow may have picked them for another board.
 *
 * @throws When a picked value isn't valid for its option.
 */
export const resolveBoardOptions = (options: IBoardOption[], picked: Record<string, BoardOptionValue>): Record<string, string> =>
	Object.fromEntries(options.map(option => {
		const value = picked[option.key] ?? option.default;
		const error = boardOptionError(option, value);
		if (error) throw new Error(`Board option: ${error}`);
		return [option.key, String(value)];
	}));

/** A board as its package's board.schema.yaml declares it: its pins, its connection, its configs. */
export const BoardSchema = zod.object({
	name: zod.string().min(1),
	description: zod.string(),

	connection: BoardConnectionSchema,

	pins: zod.array(PinSchema).min(1),

	configurations: zod.array(ConfigurationSchema).optional(),

	// What it offers besides its pins (its manifest's `capabilities`) — what
	// components that need one run on. Absent: not said, nothing is checked.
	capabilities: zod.array(CapabilitySchema).optional(),

	// The parameters of its firmware (its manifest's `options`).
	options: zod.array(BoardOptionSchema).optional(),

	// How its firmware can be written, the preferred first (its manifest's
	// `firmware.methods`) — what the studio's flash offers. Absent: serial.
	flashMethods: zod.array(BoardFlashMethodSchema).min(1).optional(),
}).strict();

/** A board as its package's board.schema.yaml declares it: its pins, its connection, its configs. */
export type IBoardSchema = zod.infer<typeof BoardSchema>;
/** The link picked for a workflow's board. */
export type IBoardConnectionState = zod.infer<typeof BoardConnectionStateSchema>;
