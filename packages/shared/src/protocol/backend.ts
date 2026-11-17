import zod from "zod";

/** Hosting -> studio (`driver:disconnected`): one of the user's drivers went offline. */
export const BackendDriverDisconnectedOutDTOSchema = zod.object({

	driverId: zod.string()

});

/** Hosting -> studio (`driver:connected`): one of the user's drivers came online. */
export const BackendDriverConnectedOutDTOSchema = zod.object({

	driverId: zod.string()

});

/**
 * Hosting -> studio (`driver:sync`): how a driver's workflow sync is going —
 * `syncing` when the hosting sends it (on connect), then `synced`, or
 * `failed` with why (some workflow's packages couldn't be installed).
 */
export const BackendDriverSyncOutDTOSchema = zod.object({

	driverId: zod.string(),
	state: zod.enum(["syncing", "synced", "failed"]),
	error: zod.string().optional(),

});

/** Hosting -> studio (`driver:disconnected`): one of the user's drivers went offline. */
export type BackendDriverDisconnectedOutDTO = zod.infer<typeof BackendDriverDisconnectedOutDTOSchema>;
/** Hosting -> studio (`driver:connected`): one of the user's drivers came online. */
export type BackendDriverConnectedOutDTO = zod.infer<typeof BackendDriverConnectedOutDTOSchema>;
/** Hosting -> studio (`driver:sync`): how a driver's workflow sync is going. */
export type BackendDriverSyncOutDTO = zod.infer<typeof BackendDriverSyncOutDTOSchema>;
