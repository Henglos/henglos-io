import { createContext, useContext, type DragEvent, type ReactNode } from "react";
import type { IActionRuntime, IComponentRuntime, IConfigurationRuntime, IWorkflowRuntime } from "@henglosio/workflow";
import type { FlowPoint } from "./types";
import type { OutputDragPayload } from "./lib/dnd";

/** What a node extension gets: the node and what it shows. */
export type NodeSlotProps = {
	id: string;
	component: IComponentRuntime;
	action: IActionRuntime;
	selected: boolean;
	/** The Start node (no inputs, no notes). */
	start: boolean;
};

/** What an app adds to a node — everything optional; a viewer adds nothing. */
export type NodeExtras = {
	/** On the node's outer box (e.g. fading it). */
	rootClassName?: string;
	/** Replaces the card's border look (default: the selection outline). */
	cardClassName?: string;
	/** Tags over the card. */
	badges?: ReactNode;
	/** The output port to light up, by name — the one the action last ended on. */
	activeOutput?: string | null;
	/** Above the outputs (e.g. how the action last ran). */
	outputsHeader?: ReactNode;
	/** Under one output's row (e.g. the value it published). */
	outputValue?: (outputName: string) => ReactNode;
	/** After the outputs (e.g. undeclared values, an error). */
	outputsFooter?: ReactNode;
	/** The node's bottom bar (e.g. run, delete). */
	footer?: ReactNode;
};

/** Which configuration a field edits. */
export type ConfigurationTarget = { componentId: string; actionId: string; configurationId: string };

/** What editing a configuration does — absent: its field is read-only. */
export type ConfigurationHandlers = {
	onChange: (target: ConfigurationTarget, value: IConfigurationRuntime["value"]) => void;
	/** Bind to an earlier action's output (dropped onto the field). */
	onBindOutput?: (target: ConfigurationTarget, sourceActionId: string, outputName: string) => void;
	/** Compute it with a Code script. */
	onSetCode?: (target: ConfigurationTarget, code: string) => void;
	/** Bind to a workflow variable (dropped onto the field). */
	onBindVariable?: (target: ConfigurationTarget, variableId: string) => void;
};

/** A script field asks the app to open its code editor. */
export type CodeEditorRequest = {
	actionId: string;
	configurationId: string;
	displayName: string;
	language: string;
	value: string;
	onChange: (value: string) => void;
	/**
	 * "binding": a CODE binding computing one config's value — must `return`.
	 * "script": a `code` config whose text *is* the value — returning is optional.
	 */
	kind: "binding" | "script";
};

/** How a wire is drawn on top of its usual look. */
export type EdgeDecoration = {
	/** Drawn as the path the flow takes next. */
	highlighted?: boolean;
	/** Faded back. */
	dimmed?: boolean;
};

/** "+" on a wire — insert an action in the middle of it. */
export type EdgeInsert = {
	screenPosition: FlowPoint;
	connectionId: string;
	source: string;
	target: string;
	sourceHandle: string;
	targetHandle: string;
};

/**
 * What the canvas is given: the workflow, and what the app lets its nodes and wires do —
 * nothing (a viewer) by default.
 */
export type WorkflowCanvasOptions = {
	workflow: IWorkflowRuntime | null;
	/** Nothing changes the workflow — fields show their values, no handles to edit. Default true. */
	readOnly?: boolean;
	/** What editing a field does. */
	configurations?: ConfigurationHandlers;
	/** The output being dragged right now (drag-to-bind) — fields light up as targets. */
	outputDrag?: OutputDragPayload | null;
	/** Script fields open the app's code editor; `openFor` is the one it shows. */
	codeEditor?: {
		openFor: { actionId: string; configurationId: string } | null;
		open: (request: CodeEditorRequest) => void;
	};
	/** Extras for each node. A hook (it may hold state): keep the same function for the canvas' lifetime. */
	useNodeExtras?: (props: NodeSlotProps) => NodeExtras;
	/** Decoration for each wire. A hook, like useNodeExtras. */
	useEdgeDecoration?: (edge: { id: string; source: string; target: string }) => EdgeDecoration;
	onNotesChange?: (change: { componentId: string; actionId: string; notes: string }) => void;
	/** Outputs can be dragged (to bind them onto a configuration elsewhere). */
	onOutputDragStart?: (event: DragEvent, output: { actionId: string; outputName: string }) => void;
	onOutputDragEnd?: () => void;
	onInsertOnEdge?: (insert: EdgeInsert) => void;
};

const WorkflowCanvasContext = createContext<WorkflowCanvasOptions | null>(null);

/** What the canvas' nodes and wires read: the workflow, and what the app lets them do. */
export function WorkflowCanvasProvider({ children, ...options }: WorkflowCanvasOptions & { children: ReactNode }) {
	return <WorkflowCanvasContext.Provider value={options}>{children}</WorkflowCanvasContext.Provider>;
}

/** The canvas' options, inside a WorkflowCanvasProvider (`readOnly` defaults to true). */
export function useWorkflowCanvas(): WorkflowCanvasOptions & { readOnly: boolean } {
	const options = useContext(WorkflowCanvasContext);
	if (!options) throw new Error("The workflow canvas' nodes must be inside a WorkflowCanvasProvider");
	return { ...options, readOnly: options.readOnly ?? true };
}

const NO_EXTRAS: NodeExtras = {};
const NO_DECORATION: EdgeDecoration = {};

/** The app's extras for a node (stable hook: the provider's function never changes). */
export function useNodeExtras(props: NodeSlotProps): NodeExtras {
	const { useNodeExtras: hook } = useWorkflowCanvas();
	return hook ? hook(props) : NO_EXTRAS;
}

/** How the app wants a wire drawn (the provider's useEdgeDecoration) — nothing extra by default. */
export function useEdgeDecoration(edge: { id: string; source: string; target: string }): EdgeDecoration {
	const { useEdgeDecoration: hook } = useWorkflowCanvas();
	return hook ? hook(edge) : NO_DECORATION;
}
