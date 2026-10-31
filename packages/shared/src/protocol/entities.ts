import zod from "zod";

/** A package a workflow needs: its npm name, version, and role (board, platform or component). */
export const PackageDTOSchema = zod.object({
	name: zod.string(),
	version: zod.string(),
	role: zod.enum(["board", "platform", "component"]),
});


/** A board on a driver's machine, as the driver lists it. */
export const DeviceDTOSchema = zod.object({

	port: zod.string(),
	usbVendor: zod.string().optional(),
	usbId: zod.string().optional()

});

/** A package a workflow needs: its npm name, version, and role (board, platform or component). */
export type PackageDTO = zod.infer<typeof PackageDTOSchema>;

/** A board on a driver's machine, as the driver lists it. */
export type DeviceDTO = zod.infer<typeof DeviceDTOSchema>;