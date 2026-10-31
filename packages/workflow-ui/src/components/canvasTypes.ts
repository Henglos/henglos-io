import type { EdgeTypes, NodeTypes } from "@xyflow/react";
import { ActionNode } from "./ActionNode";
import { StartNode } from "./StartNode";
import { ConnectionEdge } from "./ConnectionEdge";
import { EDGE_TYPE, NODE_TYPE } from "../types";

// For <ReactFlow nodeTypes edgeTypes> — module constants, so React Flow never
// sees new objects between renders.
export const nodeTypes: NodeTypes = { [NODE_TYPE.action]: ActionNode, [NODE_TYPE.start]: StartNode };
/** The canvas' wire kinds, for <ReactFlow edgeTypes>. */
export const edgeTypes: EdgeTypes = { [EDGE_TYPE]: ConnectionEdge };
