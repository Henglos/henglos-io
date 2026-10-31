import zod from "zod";

// A point a wire is drawn through, on the canvas — see WirePath.ts. `handle`:
// its bezier control on the way out, relative to it (the one in mirrors it);
// absent, the curve through it is worked out.
export const WaypointSchema = zod.object({
	x: zod.number(),
	y: zod.number(),
	handle: zod.object({ x: zod.number(), y: zod.number() }).optional(),
});

/** A wire: from `source`'s output handle to `target`'s input handle. */
export const ConnectionRuntime = zod.object({
	id: zod.string(),
	source: zod.string(),
	target: zod.string(),
	sourceHandle: zod.string(),
	targetHandle: zod.string(),
	// Where the wire is drawn through, in order — the canvas only: the board
	// never sees it. Absent: the plain curve from output to input.
	waypoints: zod.array(WaypointSchema).optional(),
});

/** A wire: from `source`'s output handle to `target`'s input handle. */
export type IConnectionRuntime = zod.infer<typeof ConnectionRuntime>;
// A point a wire is drawn through, on the canvas — see WirePath.ts. `handle`:
// its bezier control on the way out, relative to it (the one in mirrors it);
// absent, the curve through it is worked out.
export type IWaypoint = zod.infer<typeof WaypointSchema>;
