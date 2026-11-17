import zod from "zod";

/** A board on a driver's machine: its port and USB ids. */
export const UsbDeviceSchema = zod.object({
	usbVendor: zod.string().optional(),
	usbId: zod.string().optional(),
	port: zod.string(),
});

/** POST /drivers/pair/:pairToken — the machine pairing: what it shows up as, and where it runs. */
export const PairDriverInSchema = zod.object({

	name: zod.string(),

	deviceName: zod.string(),
	deviceUser: zod.string(),

});

/** POST /drivers/pair/:pairToken — the paired driver's access and refresh tokens. */
export const PairDriverOutSchema = zod.object({

	token: zod.string(),
	refreshToken: zod.string(),

});

/** POST …/flash — the board's port, and how fast to write. */
export const FlashWorkflowInSchema = zod.object({
	port: zod.string(),
	baudrate: zod.number(),
});

/** POST …/execute (and ▶ run) — the board's port and baud rate. */
export const ExecuteWorkflowInSchema = zod.object({
	port: zod.string(),
	baudrate: zod.number(),
});

/** POST …/record — the board's port and baud rate. */
export const RecordWorkflowInSchema = zod.object({
	port: zod.string(),
	baudrate: zod.number(),
});

/** DELETE /drivers/:id — it's unpaired. */
export const DeleteDriverOutSchema = zod.object({
	status: zod.literal("success"),
});

/** GET /drivers/:driverId/devices — the boards plugged into the driver's machine. */
export const ListDevicesOutSchema = zod.object({
	devices: UsbDeviceSchema.array(),
});

/** A driver in the list: its id, name, and whether it's online. */
export const DriverItemSchema = zod.object({
	id: zod.string(),
	name: zod.string(),
	online: zod.boolean(),
});

/** GET /drivers — the user's drivers. */
export const ListDriversByUserOutSchema = zod.object({
	drivers: zod.array(DriverItemSchema),
});

/** GET /drivers/pair-token — a new pair token, for `hio driver login`. */
export const PairTokenOutSchema = zod.object({
	pairToken: zod.string(),
});

/** GET /drivers/pair-token — a new pair token, for `hio driver login`. */
export type PairTokenOut = zod.infer<typeof PairTokenOutSchema>;
/** POST /drivers/pair/:pairToken — the machine pairing: what it shows up as, and where it runs. */
export type PairDriverIn = zod.infer<typeof PairDriverInSchema>;
/** POST /drivers/pair/:pairToken — the paired driver's access and refresh tokens. */
export type PairDriverOut = zod.infer<typeof PairDriverOutSchema>;

/** DELETE /drivers/:id — it's unpaired. */
export type DeleteDriverOut = zod.infer<typeof DeleteDriverOutSchema>;
/** GET /drivers/:driverId/devices — the boards plugged into the driver's machine. */
export type ListDevicesOut = zod.infer<typeof ListDevicesOutSchema>;
/** A driver in the list: its id, name, and whether it's online. */
export type DriverItem = zod.infer<typeof DriverItemSchema>;
/** GET /drivers — the user's drivers. */
export type ListDriversByUserOut = zod.infer<typeof ListDriversByUserOutSchema>;
/** POST …/flash — the board's port, and how fast to write. */
export type FlashWorkflowIn = zod.infer<typeof FlashWorkflowInSchema>;
/** POST …/execute (and ▶ run) — the board's port and baud rate. */
export type ExecuteWorkflowIn = zod.infer<typeof ExecuteWorkflowInSchema>;

// Debug from an entry of the flow: Start (no entryId), or a trigger — armed,
// the session listens for it.
export const DebugStartInSchema = ExecuteWorkflowInSchema.extend({
	entryId: zod.string().optional(),
});

/** POST …/debug — the board's port and baud rate, and where the session starts. */
export type DebugStartIn = zod.infer<typeof DebugStartInSchema>;

// The debugger's value edits — what an action published, overwritten on the board (CONTEXT_SET).
export const DebugValuesInSchema = zod.object({
	values: zod.array(zod.discriminatedUnion("kind", [
		zod.object({ name: zod.string().min(1), kind: zod.literal("integer"), value: zod.number().int() }),
		zod.object({ name: zod.string().min(1), kind: zod.literal("float"), value: zod.number() }),
		zod.object({ name: zod.string().min(1), kind: zod.literal("bool"), value: zod.boolean() }),
		zod.object({ name: zod.string().min(1), kind: zod.literal("string"), value: zod.string() }),
		zod.object({ name: zod.string().min(1), kind: zod.literal("bytes"), value: zod.array(zod.number().int().min(0).max(255)) }),
		// A list or an object — sent as its JSON (DataType LIST / OBJECT).
		zod.object({ name: zod.string().min(1), kind: zod.literal("list"), value: zod.array(zod.unknown()) }),
		zod.object({ name: zod.string().min(1), kind: zod.literal("object"), value: zod.record(zod.string(), zod.unknown()) }),
	])).min(1),
});

/** POST …/debug/:sessionId/values — the values to overwrite on the board. */
export type DebugValuesIn = zod.infer<typeof DebugValuesInSchema>;
/** POST …/record — the board's port and baud rate. */
export type RecordWorkflowIn = zod.infer<typeof RecordWorkflowInSchema>;
