import zod from "zod";

/** Hosting -> studio (`driver:disconnected`): one of the user's drivers went offline. */
export const BackendDriverDisconnectedOutDTOSchema = zod.object({

	driverId: zod.string()

});

/** Hosting -> studio (`driver:connected`): one of the user's drivers came online. */
export const BackendDriverConnectedOutDTOSchema = zod.object({

	driverId: zod.string()

});


/** Hosting -> studio (`driver:disconnected`): one of the user's drivers went offline. */
export type BackendDriverDisconnectedOutDTO = zod.infer<typeof BackendDriverDisconnectedOutDTOSchema>;
/** Hosting -> studio (`driver:connected`): one of the user's drivers came online. */
export type BackendDriverConnectedOutDTO = zod.infer<typeof BackendDriverConnectedOutDTOSchema>;
