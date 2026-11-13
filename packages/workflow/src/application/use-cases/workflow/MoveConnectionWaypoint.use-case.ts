import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { round, withWaypoints } from "./ConnectionWaypoints.js";

/** The waypoint at `index`, somewhere else — its handle goes with it. */
export class MoveConnectionWaypoint {
	execute(workflow: IWorkflowRuntime, connectionId: string, index: number, point: { x: number; y: number }): IWorkflowRuntime {
		return withWaypoints(workflow, connectionId, waypoints =>
			index >= 0 && index < waypoints.length ? waypoints.map((old, i) => (i === index ? { ...old, ...round(point) } : old)) : null);
	}
}
