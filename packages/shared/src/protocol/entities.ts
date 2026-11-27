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

/** A drive on a driver's machine — a UF2 board's bootloader shows up as one. */
export const VolumeDTOSchema = zod.object({

	/** Its label: RPI-RP2, RP2350, … (empty when it has none). */
	label: zod.string(),
	/** Where it's mounted: E:\, /Volumes/RPI-RP2, … */
	mount: zod.string(),
	/** Whether it's a board's UF2 bootloader — it has an INFO_UF2.TXT. */
	uf2: zod.boolean(),

});

/** A package a workflow needs: its npm name, version, and role (board, platform or component). */
export type PackageDTO = zod.infer<typeof PackageDTOSchema>;

/** A board on a driver's machine, as the driver lists it. */
export type DeviceDTO = zod.infer<typeof DeviceDTOSchema>;

/** A removable drive on a driver's machine. */
export type VolumeDTO = zod.infer<typeof VolumeDTOSchema>;