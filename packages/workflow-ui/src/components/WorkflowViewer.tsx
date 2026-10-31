"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	applyNodeChanges,
	Background,
	BackgroundVariant,
	MiniMap,
	Panel,
	ReactFlow,
	ReactFlowProvider,
	useNodesInitialized,
	useReactFlow,
} from "@xyflow/react";
import { Text } from "@henglosio/ui";
import { getActionOutputs, isLogicComponent, isTriggerAction, shapeLabel, type IWorkflowRuntime } from "@henglosio/workflow";
import { EyeOff, Flag, Maximize, Minus, Plus, Radio, X } from "lucide-react";
import clsx from "clsx";
import "@xyflow/react/dist/style.css";
import { WorkflowCanvasProvider, type EdgeDecoration, type NodeExtras, type NodeSlotProps } from "../context";
import { DebugBadges, DebugFollow, debugCardClass, debugRole, debugRootClass } from "../debug/DebugMarks";
import type { DebugSimulationState, DebugValue } from "../debug/simulation";
import { nodeTypes, edgeTypes } from "./canvasTypes";
import { ActionIcon, LogicIcon, nodeIcon } from "./ActionIcon";
import { TriggerMark, TriggerTag } from "./NodePorts";
import { ConfigurationField } from "./ConfigurationField";
import { isConfigVisible, mergeConfigurations, startAsComponent } from "../lib/configurations";
import { workflowToEdges, workflowToNodes } from "../lib/graph";
import { isActionNodeData, type CanvasNode } from "../types";

/** What a WorkflowViewer shows, and how. */
export type WorkflowViewerProps = {
	/** The whole workflow — with its components' schemas (names, fields and outputs come from them). */
	workflow: IWorkflowRuntime;
	className?: string;
	/** The details panel on a clicked node. Default true. */
	details?: boolean;
	/** The minimap. Default false. */
	minimap?: boolean;
	/** Zoom with the wheel. Default false — on a page, the wheel scrolls the page. */
	zoomOnScroll?: boolean;
	/** Nodes can be dragged around — only on screen: the workflow isn't changed. Default true. */
	draggable?: boolean;
	/**
	 * A debug session to show (useDebugSimulation's `state`): the node that ran
	 * and the next one marked, the wire between them flowing, the rest faded.
	 */
	debug?: DebugSimulationState | null;
	/** Continue on the next node (useDebugSimulation's `next`) — absent: no button. */
	onDebugContinue?: () => void;
	/** Frames the step on every move of the debug session. Default true. */
	followDebug?: boolean;
};

// A published value, short: text as it is, the rest as JSON.
const formatValue = (value: DebugValue) =>
	typeof value === "string" ? value : value === null ? "—" : JSON.stringify(value);

const FIT = { padding: 0.15, duration: 0 };

/**
 * A workflow, to look at: the studio's canvas — the same nodes, fields and
 * wires — with nothing to edit. Click a node for its details. Fills its box:
 * give it a height. Drawn in the browser only (React Flow measures the nodes
 * there), so a server-rendered page shows the empty canvas until it loads.
 */
export function WorkflowViewer(props: WorkflowViewerProps) {

	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	return (
		// .hio-scale: the design system's type scale, whatever page it's on (scale.css).
		<div className={clsx("hio-scale relative h-full w-full overflow-hidden bg-canvas", props.className)}>
			{mounted && (
				<ReactFlowProvider>
					<Viewer {...props} />
				</ReactFlowProvider>
			)}
		</div>
	);

}

function Viewer({ workflow, details = true, minimap = false, zoomOnScroll = false, draggable = true, debug, onDebugContinue, followDebug = true }: WorkflowViewerProps) {

	const initial = useMemo(() => workflowToNodes(workflow), [workflow]);
	const edges = useMemo(() => workflowToEdges(workflow), [workflow]);
	const [nodes, setNodes] = useState<CanvasNode[]>(initial);
	useEffect(() => setNodes(initial), [initial]);

	const selected = details ? nodes.find(node => node.selected) : undefined;
	const debugging = !!debug && debug.status !== "idle";

	// Each node's part in the debug session — its marks, the output it ended
	// on, what it published (under its outputs).
	const nodeExtras = (props: NodeSlotProps): NodeExtras => {
		if (!debugging || !debug) return {};
		const role = debugRole(debug, props.id);
		const values = role === "ran" || role === "both" ? debug.values[props.id] : undefined;
		return {
			rootClassName: debugRootClass(debugging, role),
			cardClassName: debugCardClass(role),
			badges: <DebugBadges role={role} debug={debug} onContinue={onDebugContinue} />,
			activeOutput: role === "ran" || role === "both" ? debug.ranOutput : null,
			outputValue: values ? name => name in values ? (
				<div className="flex items-baseline justify-between gap-3 px-3 py-1">
					<Text variant="low" size="xs" font="mono" className="shrink-0">{name}</Text>
					<Text variant="high" size="xs" font="mono" className="truncate">{formatValue(values[name]!)}</Text>
				</div>
			) : null : undefined,
		};
	};

	// The wire the flow takes next flows; the rest fade back.
	const edgeDecoration = (edge: { source: string; target: string }): EdgeDecoration => {
		if (!debugging || !debug) return {};
		const path = debug.status === "paused" && edge.source === debug.ranId && edge.target === debug.nextId;
		return path ? { highlighted: true } : { dimmed: true };
	};

	return (
		<WorkflowCanvasProvider workflow={workflow} readOnly useNodeExtras={nodeExtras} useEdgeDecoration={edgeDecoration}>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				// Selection, measuring and moving nodes around — on screen only:
				// nothing is written back to the workflow.
				onNodesChange={changes => setNodes(prev => applyNodeChanges(changes, prev) as CanvasNode[])}
				nodesDraggable={draggable}
				nodesConnectable={false}
				elementsSelectable
				edgesFocusable={false}
				deleteKeyCode={null}
				zoomOnScroll={zoomOnScroll}
				preventScrolling={zoomOnScroll}
				minZoom={0.2}
				proOptions={{ hideAttribution: true }}
			>
				<Background variant={BackgroundVariant.Dots} gap={32} />
				<FitWhenMeasured />
				{debugging && followDebug && <DebugFollow debug={debug} />}
				<ZoomControls />
				{minimap && (
					<MiniMap
						position="top-right"
						pannable
						zoomable
						bgColor="var(--chrome)"
						maskColor="color-mix(in srgb, var(--canvas) 72%, transparent)"
						maskStrokeColor="var(--accent-line)"
						nodeColor={node => node.type === "startNode" ? "var(--accent-line)" : "var(--overlay)"}
						nodeStrokeColor="var(--line-strong)"
						nodeBorderRadius={6}
						className="rounded-lg! border! border-line! overflow-hidden"
					/>
				)}
			</ReactFlow>

			{selected && (
				<NodeDetails
					node={selected}
					onClose={() => setNodes(prev => prev.map(node => node.selected ? { ...node, selected: false } : node))}
				/>
			)}
		</WorkflowCanvasProvider>
	);

}

// Frames the workflow once every node has its size — fitting before that
// frames boxes of size zero.
function FitWhenMeasured() {
	const measured = useNodesInitialized();
	const { fitView } = useReactFlow();
	const done = useRef(false);
	useEffect(() => {
		if (!measured || done.current) return;
		done.current = true;
		void fitView(FIT);
	}, [measured, fitView]);
	return null;
}

function ZoomControls() {
	const { zoomIn, zoomOut, fitView } = useReactFlow();
	const button = "flex size-7 items-center justify-center text-fg-muted hover:bg-hover hover:text-fg cursor-pointer";
	return (
		<Panel position="bottom-left" className="flex! flex-col overflow-hidden rounded-md border border-line bg-raised shadow-[0_2px_10px_rgb(0_0_0/0.25)]">
			<button type="button" className={button} onClick={() => zoomIn({ duration: 150 })} aria-label="Zoom in"><Plus size={14} /></button>
			<button type="button" className={clsx(button, "border-y border-line-subtle")} onClick={() => zoomOut({ duration: 150 })} aria-label="Zoom out"><Minus size={14} /></button>
			<button type="button" className={button} onClick={() => fitView({ ...FIT, duration: 250 })} aria-label="Fit the workflow"><Maximize size={13} /></button>
		</Panel>
	);
}

// The clicked node in full: what the action does, every field (the same ones
// as the node, locked), what it publishes, where its outputs go, its notes.
function NodeDetails({ node, onClose }: { node: CanvasNode; onClose: () => void }) {

	const { action } = node.data;
	const isAction = isActionNodeData(node.data);
	const component = isActionNodeData(node.data) ? node.data.component : startAsComponent(action);
	const configurations = mergeConfigurations(action.base.configurations, action.configurations);
	const visible = configurations.filter(c => isConfigVisible(c, configurations));
	const outputs = isAction ? getActionOutputs(action) : action.outputs;
	const trigger = isAction && isTriggerAction(action);
	const logic = isAction && isLogicComponent(component);
	const published = action.base.outputSchema ?? [];

	return (
		<aside className="absolute right-3 top-3 bottom-3 z-10 flex w-80 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border border-line bg-raised shadow-[0_8px_32px_rgb(0_0_0/0.35)]">

			<header className="flex items-start gap-2 border-b border-line-subtle px-4 py-3">
				{/* Its mark, as on its node: Start's flag, a trigger's round tile, Logic's or its own icon. */}
				{!isAction
					? <TriggerMark><Flag size={12} /></TriggerMark>
					: trigger
						? <TriggerMark><ActionIcon icon={nodeIcon(component, action)} fallback={<Radio size={13} />} size={13} /></TriggerMark>
						: <span className="flex size-6 shrink-0 items-center justify-center text-fg-muted">
							<ActionIcon icon={nodeIcon(component, action)} fallback={logic ? <LogicIcon action={action.base.displayName} /> : null} size={14} className={logic ? "text-accent-fg" : undefined} />
						</span>}
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<div className="flex items-center gap-2 min-w-0">
						<Text variant="high" font="mono" size="lg" className={clsx("truncate", action.disabled && "line-through decoration-fg-muted")}>{action.alias}</Text>
						{(trigger || !isAction) && <TriggerTag />}
					</div>
					<Text variant="low" size="xs">{!isAction ? "On boot" : logic ? "Logic" : component.alias}</Text>
					{action.disabled && (
						<span className="flex items-center gap-1 text-fg-muted">
							<EyeOff size={11} />
							<Text variant="low" size="xs">Disabled — the flow skips it</Text>
						</span>
					)}
				</div>
				<button type="button" onClick={onClose} className="mt-0.5 cursor-pointer text-fg-muted hover:text-fg" aria-label="Close">
					<X size={14} />
				</button>
			</header>

			<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 nowheel">

				{action.base.description && <Text variant="dim" size="xs" className="leading-5">{action.base.description}</Text>}

				<Section title="Configuration">
					{visible.length > 0
						? visible.map(configuration => (
							<ConfigurationField key={configuration.id} configuration={configuration} component={component} action={action} start={!isAction} />
						))
						: <Text variant="low" size="xs">No configuration.</Text>}
				</Section>

				{published.length > 0 && (
					<Section title="Publishes">
						{published.map(output => (
							<div key={output.name} className="flex flex-col gap-0.5">
								<div className="flex items-center justify-between gap-2">
									<Text variant="high" size="xs" font="mono">{output.name}</Text>
									<Text variant="low" size="xs" font="mono">{shapeLabel(output.type)}</Text>
								</div>
								{output.description && <Text variant="low" size="xs">{output.description}</Text>}
							</div>
						))}
					</Section>
				)}

				<Section title="Outputs">
					{outputs.map(output => (
						<Text key={output.id} variant="high" size="xs" className={output.base.id === "fallback" ? "text-danger!" : undefined}>{output.base.name}</Text>
					))}
				</Section>

				{action.notes && (
					<Section title="Notes">
						<Text variant="dim" size="xs" className="whitespace-pre-wrap wrap-break-word">{action.notes}</Text>
					</Section>
				)}

			</div>
		</aside>
	);

}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-2.5">
			<Text variant="low" size="xs" className="uppercase tracking-wider">{title}</Text>
			{children}
		</section>
	);
}
