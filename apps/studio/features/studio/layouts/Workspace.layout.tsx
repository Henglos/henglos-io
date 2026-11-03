import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
	applyEdgeChanges,
	applyNodeChanges,
	Background,
	BackgroundVariant,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
	useNodesInitialized,
	useReactFlow,
	type NodeChange,
	type OnConnectEnd,
	type OnConnectStart,
	type OnNodeDrag,
} from "@xyflow/react";
import { WorkflowAtom, WorkflowSavedCanvasAtom } from "../store/workflow.store";
import {
	type ActionNodeData,
	type CanvasNodeData,
	NodePositionOverrideAtom,
	PendingEdgeDropAtom,
	START_NODE_ID,
	WorkspaceEdgesAtom,
	WorkspaceNodesAtom,
	WorkspaceSelectionAtom,
} from "../store/canvas.store";
import { ActionNode } from "../components/ActionNode/ActionNode";
import { ActionNodeLegacy } from "../components/ActionNode/ActionNodeLegacy";
import { NODE_LAYOUT } from "../lib/nodeLayout";
import { StartNode } from "../components/StartNode/StartNode";
import { StartNodeLegacy } from "../components/StartNode/StartNodeLegacy";
import { ConnectionEdge } from "../components/ConnectionEdge/ConnectionEdge";
import { useCallback, useEffect, useRef } from "react";
import { Node } from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import { CollabCursors } from "../components/CollabCursors/CollabCursors";
import { DebugFollow } from "../components/NodePorts/DebugMarks";
import { CollabRemoteDragsAtom, type FlowPoint } from "../store/collab.store";
import { useDragPresence } from "../hooks/useDragPresence";
import {
	AddConnectionToWorkflow,
	isEntryAction,
	RemoveActionFromWorkflowComponent,
	RemoveConnectionFromWorkflow,
	ShiftConnectionWaypoints,
	type IWorkflowRuntime,
} from "@henglosio/workflow";
import { EdgeDropActionStore } from "./EdgeDropActionStore";
import { EdgeInsertActionStore } from "./EdgeInsertActionStore";
import { CanvasAddActionStore } from "./CanvasAddActionStore";
import { useWorkflowMutate } from "../hooks/useWorkflowMutate";
import { useCanvasClipboard } from "../hooks/useCanvasClipboard";

// The compact card (configs in the inspector), or the card with everything — see NODE_LAYOUT.
const nodeTypes = { actionNode: NODE_LAYOUT === "inline" ? ActionNodeLegacy : ActionNode, startNode: NODE_LAYOUT === "inline" ? StartNodeLegacy : StartNode };
const edgeTypes = { connection: ConnectionEdge };

const hasComponent = (data: CanvasNodeData): data is ActionNodeData => "component" in data;

/**
 * Where a node should be drawn, most to least authoritative:
 *  1. a pending position override (paste/insert flows);
 *  2. this client is dragging it — ReactFlow owns the position mid-drag;
 *  3. another client is dragging it — their live position (presence);
 *  4. the workflow's x/y — the shared state, so a peer's finished move lands;
 *  5. whatever was on screen, then a layout fallback.
 */
const resolvePosition = (
	stored: { x?: number; y?: number },
	prev: Node<CanvasNodeData> | undefined,
	override: FlowPoint | undefined,
	remoteDrag: FlowPoint | undefined,
	fallback: FlowPoint,
): FlowPoint => {
	if (override) return override;
	if (prev?.dragging) return prev.position;
	if (remoteDrag) return remoteDrag;
	if (stored.x !== undefined && stored.y !== undefined) return { x: stored.x, y: stored.y };
	return prev?.position ?? fallback;
};

/** Writes x/y into the workflow for every action (start included) in `positions`. */
const placeActions = (data: IWorkflowRuntime, positions: Map<string, FlowPoint>): IWorkflowRuntime => {
	const place = <T extends { id: string }>(action: T) => {
		const position = positions.get(action.id);
		return position ? { ...action, x: position.x, y: position.y } : action;
	};
	return {
		...data,
		start: place(data.start),
		components: data.components.map(component => ({
			...component,
			actions: component.actions.map(place),
		})),
	};
};

/**
 * The waypoints of every wire whose two nodes moved by the same amount — a
 * dragged selection — shifted with them, so the wire keeps its shape. Wires
 * with only one end moved keep their waypoints where they are.
 */
const shiftWaypointsWith = (data: IWorkflowRuntime, positions: Map<string, FlowPoint>): IWorkflowRuntime => {
	const actions = [data.start, ...data.components.flatMap(component => component.actions)];
	const deltas = new Map<string, FlowPoint>();
	for (const action of actions) {
		const position = positions.get(action.id);
		if (position && action.x !== undefined && action.y !== undefined) deltas.set(action.id, { x: position.x - action.x, y: position.y - action.y });
	}

	// By how much each wire moves — grouped, one shift per amount.
	const byDelta = new Map<string, { delta: FlowPoint; ids: string[] }>();
	for (const connection of data.connections) {
		if (!connection.waypoints?.length) continue;
		const a = deltas.get(connection.source);
		const b = deltas.get(connection.target);
		if (!a || !b || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5) continue;
		const key = `${Math.round(a.x)},${Math.round(a.y)}`;
		const group = byDelta.get(key) ?? { delta: a, ids: [] };
		group.ids.push(connection.id);
		byDelta.set(key, group);
	}

	let next = data;
	for (const { delta, ids } of byDelta.values()) next = new ShiftConnectionWaypoints().execute(next, ids, delta.x, delta.y);
	return next;
};

// ─── WorkspaceInner ────────────────────────────────────────────────────────────
// Componente filho necessário para poder chamar useReactFlow()
// (o hook exige estar dentro de um ReactFlowProvider)

const WorkspaceInner = () => {

	const { screenToFlowPosition, fitView } = useReactFlow();
	const nodesInitialized = useNodesInitialized();

	const [workflow, setWorkflow] = useAtom(WorkflowAtom);
	const setSavedCanvas          = useSetAtom(WorkflowSavedCanvasAtom);
	const setSelection            = useSetAtom(WorkspaceSelectionAtom);
	const [nodes, setNodes]       = useAtom(WorkspaceNodesAtom);
	const [edges, setEdges]       = useAtom(WorkspaceEdgesAtom);
	const setPendingDrop          = useSetAtom(PendingEdgeDropAtom);
	const [positionOverrides, setPositionOverrides] = useAtom(NodePositionOverrideAtom);
	const mutate                  = useWorkflowMutate();
	const clipboard                = useCanvasClipboard();
	const remoteDrags             = useAtomValue(CollabRemoteDragsAtom);
	const publishDrag             = useDragPresence();

	// Functional update — called from timeouts and effects, where a render-time
	// `workflow` closure could already be stale.
	const persistPositions = useCallback((positions: Map<string, FlowPoint>) => {
		setWorkflow(prev => prev && { ...prev, data: placeActions(prev.data, positions) });
	}, [setWorkflow]);

	// Guarda qual handle iniciou o drag corrente
	const connectingRef = useRef<{ nodeId: string; handleId: string | null; handleType: "source" | "target" } | null>(null);

	// ── copy / paste / duplicate ──────────────────────────────────────────────
	// Whether the last click landed on the canvas — kept across the effect's re-runs.
	const lastClickInCanvasRef = useRef(false);
	useEffect(() => {

		// Node copy/paste only when the canvas itself has the keyboard: a node (or
		// the canvas) is what was last clicked, nothing is being typed in, and no
		// text is selected — otherwise Ctrl+C / Ctrl+V are the browser's, for the
		// Logs, a config's input, an output's value…
		const isCanvasFocused = () => {
			const el = document.activeElement as HTMLElement | null;
			if (isEditingText()) return false;
			const selected = window.getSelection();
			if (selected && !selected.isCollapsed && selected.toString() !== "") return false;
			// The empty canvas takes no focus — a click there leaves it on the
			// body, same as a click in the Logs: what was clicked last tells them apart.
			if (!el || el === document.body) return lastClickInCanvasRef.current;
			return el.closest(".react-flow") !== null;
		};

		const onPointerDown = (e: PointerEvent) => {
			lastClickInCanvasRef.current = e.target instanceof Element && e.target.closest(".react-flow") !== null;
		};

		const isEditingText = () => {
			const el = document.activeElement as HTMLElement | null;
			if (!el) return false;
			if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return true;
			if (el.closest("input, textarea, select, [contenteditable=true], [role=textbox], [role=combobox], [role=listbox]")) return true;
			// Monaco (the Code binding editor — see CodeEditor.feature.tsx) focuses
			// its own internal hidden textarea while typing/selecting, which the
			// check above should already catch — but that textarea sits deep
			// inside a wrapper Monaco itself manages, and depending on timing
			// (e.g. right after a click, before Monaco re-focuses it) the
			// document's activeElement can transiently be some other node still
			// inside the editor's container. Without this, Ctrl+C/Ctrl+V while
			// editing code got hijacked by the canvas's own node copy/paste
			// (clipboard.copy() overwriting the OS clipboard with node JSON
			// instead of the selected text) — closest(".monaco-editor") catches
			// that case regardless of which exact element inside it has focus.
			return el.closest(".monaco-editor") !== null;
		};

		const onKeyDown = (e: KeyboardEvent) => {

			if (!(e.ctrlKey || e.metaKey)) return;
			if (!isCanvasFocused()) return;

			const key = e.key.toLowerCase();

			if (key === "c") {
				e.preventDefault();
				clipboard.copy();
			} else if (key === "v") {
				clipboard.paste();
			} else if (key === "d") {
				e.preventDefault();
				clipboard.duplicate();
			}

		};

		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onPointerDown, true);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onPointerDown, true);
		};

	}, [clipboard]);

	// ── workflow → nodes ──────────────────────────────────────────────────────
	useEffect(() => {
		if (!workflow) return;

		setNodes(prev => {
			const prevMap = new Map(prev.map(n => [n.id, n]));
			const selMap = Object.fromEntries(prev.map(n => [n.id, n.selected ?? false]));

			const consumed = new Map<string, FlowPoint>();

			const start = workflow.data.start;
			const startOverride = positionOverrides[start.id];
			if (startOverride) consumed.set(start.id, startOverride);

			const startNode: Node<CanvasNodeData> = {
				id:         start.id,
				type:       "startNode",
				position:   resolvePosition(start, prevMap.get(start.id), startOverride, remoteDrags[start.id], { x: 0, y: 0 }),
				selected:   selMap[start.id],
				deletable:  false,
				data:       { action: start },
			};

			const componentNodes = workflow.data.components.flatMap((component, ci): Node<CanvasNodeData>[] =>
				component.actions.map((action, ai) => {
					const override = positionOverrides[action.id];
					if (override) consumed.set(action.id, override);

					return {
						id:       action.id,
						type:     "actionNode",
						position: resolvePosition(action, prevMap.get(action.id), override, remoteDrags[action.id], { x: ci * 320, y: ai * 200 }),
						selected: selMap[action.id],
						data:     { component, action },
					};
				})
			);

			// Defensive: workflow.data is meant to have every action.id appear at
			// most once (across all components, and distinct from start.id), but
			// ReactFlow keys nodes by id — if a transient inconsistency upstream
			// (e.g. two mutate() responses racing) ever produces the same id
			// twice, rendering both crashes React's key diffing instead of just
			// looking wrong. Keep the first occurrence and drop the rest, loudly,
			// instead of passing dupes through. Seeded with start.id too — an
			// action id colliding with it would otherwise sail through unnoticed.
			const seen = new Set<string>([startNode.id]);
			const dedupedComponentNodes = componentNodes.filter(node => {
				if (seen.has(node.id)) {
					console.warn(`[Workspace] duplicate action id in workflow.data, dropping extra node: ${node.id}`);
					return false;
				}
				seen.add(node.id);
				return true;
			});

			const result = [startNode, ...dedupedComponentNodes];

			// Limpa overrides já aplicados e grava a posição deles no workflow —
			// sem isso o override só existia na tela, e ao reabrir a action caía
			// no layout fallback. (setTimeout evita setState-dentro-de-setState)
			if (consumed.size > 0) {
				setTimeout(() => {
					setPositionOverrides(prev => {
						const next = { ...prev };
						consumed.forEach((_, id) => delete next[id]);
						return next;
					});
					persistPositions(consumed);
				}, 0);
			}

			return result;
		});

	}, [workflow, positionOverrides, remoteDrags]);

	// Any node drawn without a stored x/y (an action added with no explicit
	// spot, or a workflow saved before positions were persisted) gets its
	// on-screen position written back — otherwise it would sit at the layout
	// fallback, which depends on list order and moves around between opens.
	useEffect(() => {
		const missing = new Map<string, FlowPoint>();
		for (const node of nodes) {
			const { action } = node.data;
			if (node.dragging || (action.x !== undefined && action.y !== undefined)) continue;
			missing.set(node.id, node.position);
		}
		if (missing.size > 0) persistPositions(missing);
	}, [nodes, persistPositions]);

	// Opens framed on the nodes — once per workflow, when they've been measured.
	// (ReactFlow's own fitView prop only fits at mount, and the nodes arrive
	// after it, from the effect above — the view stayed at 0,0.) maxZoom keeps
	// a workflow of one or two nodes from opening zoomed right in.
	const fittedFor = useRef<string | null>(null);
	useEffect(() => {
		if (!workflow || !nodesInitialized || fittedFor.current === workflow.id) return;
		fittedFor.current = workflow.id;
		void fitView({ padding: 0.2, maxZoom: 1 });
	}, [workflow, nodesInitialized, fitView]);

	// ── workflow → edges ──────────────────────────────────────────────────────
	useEffect(() => {
		if (!workflow) return;

		// Same defensive dedupe as the nodes effect above, and for the same
		// reason: ReactFlow keys edges by id too.
		const seenConnections = new Set<string>();
		const connections = (workflow.data.connections ?? []).filter(conn => {
			if (seenConnections.has(conn.id)) {
				console.warn(`[Workspace] duplicate connection id in workflow.data, dropping extra edge: ${conn.id}`);
				return false;
			}
			seenConnections.add(conn.id);
			return true;
		});

		// Keeps which wires are selected — rebuilt on every change of the workflow
		// (a remote edit, an autosave), a selected wire would otherwise lose it
		// before Delete could remove it.
		setEdges(prev => {
			const selected = new Set(prev.filter(edge => edge.selected).map(edge => edge.id));
			return connections.map(conn => ({
				id:           conn.id,
				source:       conn.source,
				target:       conn.target,
				sourceHandle: conn.sourceHandle,
				targetHandle: conn.targetHandle,
				selected:     selected.has(conn.id),
				data:         conn,
			}));
		});
	}, [workflow]);

	// ── handlers de nodes/edges ───────────────────────────────────────────────

	const onNodesChange = useCallback(
		(changes: NodeChange<Node<CanvasNodeData>>[]) => {
			publishDrag(changes);
			setNodes(prev => {
				const updated = applyNodeChanges(changes, prev) as Node<CanvasNodeData>[];

				const selectionMap = new Map<string, string[]>();
				for (const node of updated) {
					if (!node.selected) continue;
					const { action } = node.data;
					const componentId = hasComponent(node.data) ? node.data.component.id : START_NODE_ID;
					if (!selectionMap.has(componentId)) selectionMap.set(componentId, []);
					selectionMap.get(componentId)!.push(action.id);
				}

				setSelection(
					Array.from(selectionMap.entries()).map(([componentId, actionId]) => ({ componentId, actionId }))
				);

				return updated;
			});
		},
		[setSelection, publishDrag],
	);

	const onEdgesChange = useCallback(
		(changes: any) => {
			setEdges(prev => applyEdgeChanges(changes, prev));

			const removes = changes.filter((c: any) => c.type === "remove");
			if (!removes.length || !workflow) return;

			const updatedData = removes.reduce((acc: any, change: any) => {
				const { workflow: next } = new RemoveConnectionFromWorkflow().execute(acc, change.id);
				return next;
			}, workflow.data);

			setWorkflow({ ...workflow, data: updatedData });
		},
		[workflow, setWorkflow],
	);

	const onNodesDelete = useCallback(
		(deleted: Node<CanvasNodeData>[]) => {
			if (!workflow) return;

			// O node do Start não é deletável (deletable: false), mas o filtro abaixo
			// protege contra qualquer chamada direta que ignore essa flag.
			const deletableNodes = deleted.filter((node): node is Node<ActionNodeData> => hasComponent(node.data));
			if (deletableNodes.length === 0) return;

			// Local update for immediate visual consistency (prevents effects from re-adding nodes)
			const updatedData = deletableNodes.reduce((acc, node) => {
				const { workflow: next } = new RemoveActionFromWorkflowComponent().execute(
					acc,
					node.data.component.id,
					node.data.action.id,
				);
				return next;
			}, workflow.data);

			setWorkflow({ ...workflow, data: updatedData });
			setSavedCanvas({ start: updatedData.start, components: updatedData.components, connections: updatedData.connections });

			const deletedActionIds = new Set(deletableNodes.map(n => n.data.action.id));
			setSelection(prev =>
				prev
					.map(sel => ({ ...sel, actionId: sel.actionId.filter(id => !deletedActionIds.has(id)) }))
					.filter(sel => sel.actionId.length > 0)
			);

			mutate(...deletableNodes.map(node => ({
				op: "remove:action" as const,
				componentId: node.data.component.id,
				actionId: node.data.action.id,
			})));
		},
		[workflow, setWorkflow, setSavedCanvas, setSelection, mutate],
	);

	// Start and the triggers begin a branch: nothing may be wired into them.
	const isValidConnection = useCallback(
		(connection: { target: string }) => !workflow || !isEntryAction(workflow.data, connection.target),
		[workflow],
	);

	const onConnect = useCallback(
		(params: any) => {
			if (!workflow) return;

			const { workflow: updated, connection } = new AddConnectionToWorkflow().execute(
				workflow.data,
				params.source,
				params.target,
				params.sourceHandle,
				params.targetHandle,
			);

			if (!connection) return;

			setWorkflow({ ...workflow, data: updated });
		},
		[workflow, setWorkflow],
	);

	// Persists every node that moved — `nodes` is the whole dragged selection,
	// not just the one under the pointer. Positions now come from the workflow
	// (see resolvePosition), so a node left out here would snap back. The wires
	// between nodes that moved together take their waypoints along.
	const onNodeDragStop: OnNodeDrag<Node<CanvasNodeData>> = useCallback(
		(_event, _node, nodes) => {
			const positions = new Map(nodes.map(n => [n.id, n.position]));
			setWorkflow(prev => prev && { ...prev, data: placeActions(shiftWaypointsWith(prev.data, positions), positions) });
		},
		[setWorkflow],
	);

	// ── handlers de edge drag ─────────────────────────────────────────────────

	const onConnectStart: OnConnectStart = useCallback((_event, { nodeId, handleId, handleType }) => {
		connectingRef.current = { nodeId: nodeId ?? "", handleId, handleType: handleType ?? "source" };
	}, []);

	const onConnectEnd: OnConnectEnd = useCallback(
		(event, connectionState) => {
			// Conexão válida — onConnect já cuida
			if (connectionState.isValid) return;
			if (!connectingRef.current?.nodeId) return;

			const clientX = "changedTouches" in event
				? event.changedTouches[0]!.clientX
				: (event as MouseEvent).clientX;
			const clientY = "changedTouches" in event
				? event.changedTouches[0]!.clientY
				: (event as MouseEvent).clientY;

			setPendingDrop({
				screenPosition:   { x: clientX, y: clientY },
				flowPosition:     screenToFlowPosition({ x: clientX, y: clientY }),
				sourceNodeId:     connectingRef.current.nodeId,
				sourceHandleId:   connectingRef.current.handleId,
				sourceHandleType: connectingRef.current.handleType,
			});

			connectingRef.current = null;
		},
		[screenToFlowPosition, setPendingDrop],
	);

	return (
		<ReactFlow
			nodes={nodes}
			edges={edges}
			nodeTypes={nodeTypes}
			edgeTypes={edgeTypes}
			onNodesChange={onNodesChange}
			onEdgesChange={onEdgesChange}
			onNodesDelete={onNodesDelete}
			onConnect={onConnect}
			isValidConnection={isValidConnection}
			onConnectStart={onConnectStart}
			onConnectEnd={onConnectEnd}
			onNodeDragStop={onNodeDragStop}
			deleteKeyCode={["Backspace", "Delete"]}
			// Default é "Space" — escuta no window inteiro (useKeyPress com
			// target: window), então digitar espaço em QUALQUER input de texto
			// da página (não só dentro do canvas), como o Monaco do CodeEditor,
			// disputa com o pan temporário do ReactFlow. Pan por arrasto
			// (panOnDrag, ligado por padrão) já cobre o caso de uso; não
			// depende do espaço pra nada aqui.
			panActivationKeyCode={null}
			snapGrid={[14, 14]}
			snapToGrid={true}
			defaultEdgeOptions={{ type: "connection" }}
			connectionLineStyle={{ strokeWidth: 2 }}
		>
			<Background variant={BackgroundVariant.Dots} gap={32} />
			<CollabCursors />
			<DebugFollow />
			<MiniMap
				position="top-right"
				pannable
				zoomable
				ariaLabel="Workflow overview"
				// Theme tokens (they follow light/dark): xyflow puts these in CSS variables.
				bgColor="var(--chrome)"
				maskColor="color-mix(in srgb, var(--canvas) 72%, transparent)"
				maskStrokeColor="var(--accent-line)"
				maskStrokeWidth={1.5}
				nodeColor={node => node.type === "startNode" ? "var(--accent-line)" : "var(--overlay)"}
				nodeStrokeColor={node => node.selected ? "var(--accent)" : "var(--line-strong)"}
				nodeStrokeWidth={2}
				nodeBorderRadius={6}
				className="rounded-lg! border! border-line! overflow-hidden shadow-[0_4px_16px_rgb(0_0_0/0.3)]"
			/>
		</ReactFlow>
	);

};

// ─── WorkspaceLayout ──────────────────────────────────────────────────────────

export const WorkspaceLayout = () => (
	<div className="w-full h-full bg-canvas">
		<ReactFlowProvider>
			<WorkspaceInner />
			<EdgeDropActionStore />
			<EdgeInsertActionStore />
			<CanvasAddActionStore />
		</ReactFlowProvider>
	</div>
);
