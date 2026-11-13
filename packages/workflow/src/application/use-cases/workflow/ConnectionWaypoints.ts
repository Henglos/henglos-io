import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IConnectionRuntime, IWaypoint } from "../../../domain/entities/IConnection.runtime.js";

// The waypoints a wire is drawn through (see WirePath.ts) — added, moved and
// removed one at a time. A wire left with none drops the field.

export const withWaypoints = (workflow: IWorkflowRuntime, connectionId: string, change: (waypoints: IWaypoint[]) => IWaypoint[] | null): IWorkflowRuntime => {
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

export const round = (point: { x: number; y: number }) => ({ x: Math.round(point.x), y: Math.round(point.y) });

