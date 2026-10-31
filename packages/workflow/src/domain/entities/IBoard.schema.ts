import zod from "zod";
import { PinSchema } from "./IPin.schema.js";
import { ConfigurationSchema } from "./IConfiguration.schema.js";
import { CapabilitySchema } from "../value-objects/Capabilities.js";

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

/** The link picked for a workflow's board. */
export const BoardConnectionStateSchema = zod.object({
	serial: SerialConnectionStateSchema.optional(),
	wifi: WifiConnectionStateSchema.optional(),
}).refine((data) => data.serial || data.wifi, {
	message: "connection state must have at least serial or wifi",
});

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
}).strict();

/** A board as its package's board.schema.yaml declares it: its pins, its connection, its configs. */
export type IBoardSchema = zod.infer<typeof BoardSchema>;
/** The link picked for a workflow's board. */
export type IBoardConnectionState = zod.infer<typeof BoardConnectionStateSchema>;
