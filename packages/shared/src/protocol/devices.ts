import zod from "zod";
import { DeviceDTOSchema } from "./entities.js";

/** Hosting -> driver (`device:list`): which boards are plugged in. */
export const DriverListDevicesInDTOSchema = zod.object({

	id: zod.string(),
	driverId: zod.string()

});

// What has a board busy. Hosting -> driver: `port:status` answers the tasks
// holding the port. Hosting -> studio: GET /drivers/:driverId/ports/status?port=,
// with what the hosting knows of them.
export const DriverPortStatusInDTOSchema = zod.object({
	id: zod.string(),
	port: zod.string(),
});

/** A task holding a board's port, as the driver knows it. */
export const DriverPortTaskSchema = zod.object({
	taskId: zod.string(),
	type: zod.string(),
	startedAt: zod.number(),
});

/** GET /drivers/:driverId/ports/status — the tasks holding the board's port, with what the hosting knows of them. */
export const PortStatusOutSchema = zod.object({
	tasks: zod.array(DriverPortTaskSchema.extend({
		// The hosting's own task type (debug, run, execute...), and its
		// workflow — absent for a task it doesn't know any more (it restarted).
		hostingType: zod.string().optional(),
		// What it is to the user: play (execute), debug, run, record, flash.
		label: zod.string().optional(),
		workflowId: zod.string().optional(),
	})),
});

/** Hosting -> driver (`device:list`): which boards are plugged in. */
export type DriverListDevicesInDTO = zod.infer<typeof DriverListDevicesInDTOSchema>;
/** Hosting -> driver (`port:status`): what holds a board's port. */
export type DriverPortStatusInDTO = zod.infer<typeof DriverPortStatusInDTOSchema>;
/** A task holding a board's port, as the driver knows it. */
export type DriverPortTask = zod.infer<typeof DriverPortTaskSchema>;
/** GET /drivers/:driverId/ports/status — the tasks holding the board's port, with what the hosting knows of them. */
export type PortStatusOut = zod.infer<typeof PortStatusOutSchema>;
