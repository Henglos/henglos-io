import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { withWaypoints } from "./ConnectionWaypoints.js";

/** The waypoint at `index` gone — the wire straightens through the others. */
export class RemoveConnectionWaypoint {
	execute(workflow: IWorkflowRuntime, connectionId: string, index: number): IWorkflowRuntime {
		return withWaypoints(workflow, connectionId, waypoints =>
			index >= 0 && index < waypoints.length ? waypoints.filter((_, i) => i !== index) : null);
	}
}
