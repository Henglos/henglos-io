import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IConnectionRuntime, IWaypoint } from "../../../domain/entities/IConnection.runtime.js";

// The waypoints a wire is drawn through (see WirePath.ts) — added, moved and
// removed one at a time. A wire left with none drops the field.

const withWaypoints = (workflow: IWorkflowRuntime, connectionId: string, change: (waypoints: IWaypoint[]) => IWaypoint[] | null): IWorkflowRuntime => {
	let changed = false;
	const connections = workflow.connections.map((connection): IConnectionRuntime => {
		if (connection.id !== connectionId) return connection;
		const next = change(connection.waypoints ?? []);
		if (!next) return connection;
		changed = true;
		const { waypoints: _old, ...rest } = connection;
		return next.length > 0 ? { ...rest, waypoints: next } : rest;
	});
	return changed ? { ...workflow, connections } : workflow;
};

const round = (point: { x: number; y: number }) => ({ x: Math.round(point.x), y: Math.round(point.y) });

/** A waypoint at `index` (0: right after the output). */
export class AddConnectionWaypoint {
	execute(workflow: IWorkflowRuntime, connectionId: string, index: number, point: { x: number; y: number }): IWorkflowRuntime {
		return withWaypoints(workflow, connectionId, waypoints => {
			const at = Math.max(0, Math.min(index, waypoints.length));
			return [...waypoints.slice(0, at), round(point), ...waypoints.slice(at)];
		});
	}
}

/** The waypoint at `index`, somewhere else — its handle goes with it. */
export class MoveConnectionWaypoint {
	execute(workflow: IWorkflowRuntime, connectionId: string, index: number, point: { x: number; y: number }): IWorkflowRuntime {
		return withWaypoints(workflow, connectionId, waypoints =>
			index >= 0 && index < waypoints.length ? waypoints.map((old, i) => (i === index ? { ...old, ...round(point) } : old)) : null);
	}
}

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

/** The waypoint at `index` gone — the wire straightens through the others. */
export class RemoveConnectionWaypoint {
	execute(workflow: IWorkflowRuntime, connectionId: string, index: number): IWorkflowRuntime {
		return withWaypoints(workflow, connectionId, waypoints =>
			index >= 0 && index < waypoints.length ? waypoints.filter((_, i) => i !== index) : null);
	}
}
