import { atom } from "jotai";
import type { Edge, Node } from "@xyflow/react";
import type {
	IActionRuntime,
	IComponentRuntime,
	IConnectionRuntime,
} from "@henglosio/workflow";

export type ActionNodeData = {
	component: IComponentRuntime;
	action: IActionRuntime;
};

export type StartNodeData = {
	action: IActionRuntime;
};

export type CanvasNodeData = ActionNodeData | StartNodeData;

export const START_NODE_ID = "start";

export type WorkspaceSelection = {
	componentId: string;
	actionId: string[];
};

export type PendingEdgeDrop = {
	screenPosition: { x: number; y: number };
	flowPosition: { x: number; y: number };
	sourceNodeId: string;
	sourceHandleId: string | null;
	sourceHandleType: "source" | "target";
} | null;

export type PendingEdgeInsert = {
	screenPosition: { x: number; y: number };
	connectionId: string;
	source: string;
	target: string;
	sourceHandle: string;
	targetHandle: string;
} | null;

export type PendingAddAction = {
	screenPosition: { x: number; y: number };
} | null;

export const WorkspaceNodesAtom = atom<Node<CanvasNodeData>[]>([]);
export const WorkspaceEdgesAtom = atom<Edge<IConnectionRuntime>[]>([]);
export const WorkspaceSelectionAtom = atom<WorkspaceSelection[]>([]);
export const PendingEdgeDropAtom = atom<PendingEdgeDrop>(null);
export const PendingEdgeInsertAtom = atom<PendingEdgeInsert>(null);
export const PendingAddActionAtom = atom<PendingAddAction>(null);
// The canvas toolbox's "+": same picker, the new action placed in the middle of the view.
export const PendingCanvasAddActionAtom = atom<PendingAddAction>(null);
export const NodePositionOverrideAtom = atom<
	Record<string, { x: number; y: number }>
>({});

// The component whose actions the secondary sidebar shows (Action Store).
// null = sidebar closed.
export const ActionStoreTargetAtom = atom<IComponentRuntime | null>(null);

// Whether the secondary sidebar shows the Component Store (the catalog of
// installable components) — mutually exclusive with ActionStoreTargetAtom.
export const ComponentStoreOpenAtom = atom<boolean>(false);

// The "code" field (Monaco) being edited in the secondary sidebar — null =
// none open. Takes priority over ActionStoreTargetAtom/ComponentStoreOpenAtom
// (see SecondarySidebarLayout): opening a code editor closes whatever else
// was open there.
export type CodeEditorTarget = {
	actionId: string;
	configurationId: string;
	displayName: string;
	language: string;
	value: string;
	onChange: (value: string) => void;
	/**
	 * "binding": a CODE binding computing one config's value — must `return`.
	 * "script": a `code` config whose text *is* the value (e.g. the Code node's
	 * Script) — returning is optional.
	 */
	kind: "binding" | "script";
};
export const CodeEditorTargetAtom = atom<CodeEditorTarget | null>(null);

