import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { round, withWaypoints } from "./ConnectionWaypoints.js";

/** A waypoint at `index` (0: right after the output). */
export class AddConnectionWaypoint {
	execute(workflow: IWorkflowRuntime, connectionId: string, index: number, point: { x: number; y: number }): IWorkflowRuntime {
		return withWaypoints(workflow, connectionId, waypoints => {
			const at = Math.max(0, Math.min(index, waypoints.length));
			return [...waypoints.slice(0, at), round(point), ...waypoints.slice(at)];
		});
	}
}
