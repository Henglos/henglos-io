import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { round, withWaypoints } from "./ConnectionWaypoints.js";

/**
 * Moves the waypoints of the wires in `connectionIds` by dx, dy — wires whose
 * two nodes were moved together (a dragged selection) keep their shape.
 */
export class ShiftConnectionWaypoints {
	execute(workflow: IWorkflowRuntime, connectionIds: Iterable<string>, dx: number, dy: number): IWorkflowRuntime {
		if (dx === 0 && dy === 0) return workflow;
		let next = workflow;
		for (const connectionId of connectionIds) {
			next = withWaypoints(next, connectionId, waypoints => waypoints.map(point => ({ ...point, ...round({ x: point.x + dx, y: point.y + dy }) })));
		}
		return next;
	}
}
