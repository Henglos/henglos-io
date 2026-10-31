import type { Edge, Node } from "@xyflow/react";
import type { IActionRuntime, IComponentRuntime, IConnectionRuntime } from "@henglosio/workflow";

/** What an action's node carries: the action, and the component it belongs to. */
export type ActionNodeData = {
	component: IComponentRuntime;
	action: IActionRuntime;
};

/** What the Start node carries. */
export type StartNodeData = {
	action: IActionRuntime;
};

/** What any node carries. */
export type CanvasNodeData = ActionNodeData | StartNodeData;
/** A node on the canvas (React Flow's). */
export type CanvasNode = Node<CanvasNodeData>;
/** A wire on the canvas — its data is the workflow's connection. */
export type CanvasEdge = Edge<IConnectionRuntime>;

/** A point in the canvas' coordinates. */
export type FlowPoint = { x: number; y: number };

/** The component id Start stands in for (selection, startAsComponent) — not its node id. */
export const START_NODE_ID = "start";

/** The canvas' node kinds (React Flow's `type`). */
export const NODE_TYPE = { action: "actionNode", start: "startNode" } as const;
/** The canvas' wire kind (React Flow's `type`). */
export const EDGE_TYPE = "connection";

/** Whether a node is an action's (not Start). */
export const isActionNodeData = (data: CanvasNodeData): data is ActionNodeData => "component" in data;
