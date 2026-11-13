import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IWaypoint } from "../../../domain/entities/IConnection.runtime.js";
import { round, withWaypoints } from "./ConnectionWaypoints.js";

/**
 * All of a wire's waypoints at once — the studio writes a loop's own route
 * (loopWaypoints) this way, with the point added to it, so bending a loop
 * starts from the curve it had. Empty: back to the plain wire.
 */
export class SetConnectionWaypoints {
	execute(workflow: IWorkflowRuntime, connectionId: string, waypoints: IWaypoint[]): IWorkflowRuntime {
		return withWaypoints(workflow, connectionId, () => waypoints.map(({ handle, ...point }) => ({ ...round(point), ...(handle && { handle: round(handle) }) })));
	}
}
