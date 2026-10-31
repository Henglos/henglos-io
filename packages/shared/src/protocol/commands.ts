import zod from "zod";

/** How a compile ended — what the driver's CompileWorkflowUseCase returns. */
export const WorkflowCompileResponseSchema = zod.object({
	compiled: zod.boolean(),
});

/** A package a workflow needs on the driver: its npm name, version, and what it is to the workflow. */
export const SyncPackageSchema = zod.object({
	name: zod.string(),
	version: zod.string(),
	role: zod.enum(["board", "platform", "component"]),
});

/** A board plugged into a driver's machine: its serial port, and its USB ids. */
export const DeviceSchema = zod.object({
	port: zod.string(),
	usbId: zod.string().optional(),
	usbVendor: zod.string().optional(),
});

/**
 * A driver's answer to a one-off command (`device:list`, `port:status`, `driver:restart`…),
 * by the command's id: `done` with its data, or `error`.
 */
export const DriverResultOutDTOSchema = zod.object({
	id: zod.string(),
	type: zod.literal(["done", "error"]),
	data: zod.any()
})

/** How a compile ended — what the driver's CompileWorkflowUseCase returns. */
export type WorkflowCompileResponse = zod.infer<typeof WorkflowCompileResponseSchema>;

/** A package a workflow needs on the driver: its npm name, version, and what it is to the workflow. */
export type SyncPackage = zod.infer<typeof SyncPackageSchema>;

/** A board plugged into a driver's machine: its serial port, and its USB ids. */
export type Device = zod.infer<typeof DeviceSchema>;

/**
 * A driver's answer to a one-off command (`device:list`, `port:status`, `driver:restart`…),
 * by the command's id: `done` with its data, or `error`.
 */
export type DriverResultDTO = zod.infer<typeof DriverResultOutDTOSchema>;
