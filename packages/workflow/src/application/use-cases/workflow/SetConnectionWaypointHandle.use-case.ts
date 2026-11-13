import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { round, withWaypoints } from "./ConnectionWaypoints.js";

/**
 * The waypoint at `index`: where its bezier control on the way out is,
 * relative to it (the way in mirrors it). Null: back to the worked-out curve.
 */
export class SetConnectionWaypointHandle {
	execute(workflow: IWorkflowRuntime, connectionId: string, index: number, handle: { x: number; y: number } | null): IWorkflowRuntime {
		return withWaypoints(workflow, connectionId, waypoints => {
			if (index < 0 || index >= waypoints.length) return null;
			return waypoints.map((old, i) => {
				if (i !== index) return old;
				const { handle: _old, ...point } = old;
				return handle ? { ...point, handle: round(handle) } : point;
			});
		});
	}
}
