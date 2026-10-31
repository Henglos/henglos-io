import { AddConnectionToWorkflow, type IActionRuntime, type IConnectionRuntime, type IWorkflowRuntime } from "@henglosio/workflow";
import { EDGE_TYPE, NODE_TYPE, type CanvasEdge, type CanvasNode, type FlowPoint } from "../types";

/** Where a node is drawn: given its action and a layout fallback. */
export type PositionResolver = (action: IActionRuntime, fallback: FlowPoint) => FlowPoint;

const storedPosition: PositionResolver = (action, fallback) =>
	action.x !== undefined && action.y !== undefined ? { x: action.x, y: action.y } : fallback;

/**
 * The workflow's nodes: Start, then every component's actions. `position`
 * decides where each goes (default: its stored x/y, else a grid by
 * component and order).
 *
 * Every action id is meant to appear once (and differ from Start's), but React
 * Flow keys nodes by id — a duplicate (two responses racing upstream) would
 * crash its diffing instead of just looking wrong, so extras are dropped, loudly.
 */
export function workflowToNodes(workflow: IWorkflowRuntime, position: PositionResolver = storedPosition): CanvasNode[] {

	const { start } = workflow;
	const nodes: CanvasNode[] = [{
		id: start.id,
		type: NODE_TYPE.start,
		position: position(start, { x: 0, y: 0 }),
		deletable: false,
		data: { action: start },
	}];

	const seen = new Set<string>([start.id]);
	workflow.components.forEach((component, ci) => {
		component.actions.forEach((action, ai) => {
			if (seen.has(action.id)) {
				console.warn(`[workflow-ui] duplicate action id in the workflow, dropping the extra node: ${action.id}`);
				return;
			}
			seen.add(action.id);
			nodes.push({
				id: action.id,
				type: NODE_TYPE.action,
				position: position(action, { x: ci * 320, y: ai * 200 }),
				data: { component, action },
			});
		});
	});

	return nodes;

}

/** The workflow's wires — one edge per connection, deduped by id like the nodes. */
export function workflowToEdges(workflow: IWorkflowRuntime): CanvasEdge[] {

	const seen = new Set<string>();
	return (workflow.connections ?? []).flatMap(connection => {
		if (seen.has(connection.id)) {
			console.warn(`[workflow-ui] duplicate connection id in the workflow, dropping the extra edge: ${connection.id}`);
			return [];
		}
		seen.add(connection.id);
		return [{
			id: connection.id,
			type: EDGE_TYPE,
			source: connection.source,
			target: connection.target,
			sourceHandle: connection.sourceHandle,
			targetHandle: connection.targetHandle,
			data: connection,
		}];
	});

}

/** A wire to add: from `source`'s output handle to `target`'s input handle ("default" when unset). */
export type ConnectionRequest = {
	source: string;
	target: string;
	sourceHandle?: string | null;
	targetHandle?: string | null;
};

/** Wires `source` to `target` — `connection` is null when the workflow doesn't allow it. */
export function connectActions(workflow: IWorkflowRuntime, request: ConnectionRequest): { workflow: IWorkflowRuntime; connection: IConnectionRuntime | null } {
	return new AddConnectionToWorkflow().execute(
		workflow,
		request.source,
		request.target,
		request.sourceHandle ?? "default",
		request.targetHandle ?? "default",
	);
}
