import { useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, useReactFlow, type EdgeProps, type InternalNode } from "@xyflow/react";
import { Plus, X } from "lucide-react";
import clsx from "clsx";
import {
	AddConnectionWaypoint,
	MoveConnectionWaypoint,
	RemoveConnectionWaypoint,
	SetConnectionWaypointHandle,
	SetConnectionWaypoints,
	loopWaypoints,
	waypointInsertIndex,
	wireHandles,
	wirePath,
	type IConnectionRuntime,
	type IWaypoint,
	type IWorkflowRuntime,
	type WireBox,
} from "@henglosio/workflow";
import { PendingEdgeInsertAtom } from "@/features/studio/store/canvas.store";
import { DebugSessionAtom } from "@/features/studio/store/debug.store";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";

// What's being dragged: a waypoint, or one of its two bezier controls.
type Grip = { index: number; part: "point" | "in" | "out" };

// A node's box on the canvas, once React Flow has measured it.
const boxOf = (node: InternalNode | undefined): WireBox | null =>
	node?.measured.width && node.measured.height
		? { ...node.internals.positionAbsolute, width: node.measured.width, height: node.measured.height }
		: null;

// A wire between two actions. Hovering it offers "+" to insert an action in
// the middle. A wire going back to a node behind (a loop) goes round below
// both on its own. Double-click it to add a waypoint there — the wire then curves
// through its waypoints; drag one to
// move it; click one and Delete (or its ×), or double-click it, to remove it.
// Selected, each waypoint shows its
// bezier controls: drag one to shape the curve there (the other mirrors it),
// double-click it to go back to the worked-out curve.
export const ConnectionEdge: React.FC<EdgeProps> = ({
	id,
	source,
	target,
	sourceHandleId,
	targetHandleId,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	style,
	markerEnd,
	selected,
	data,
}) => {

	const [hovered, setHovered] = useState(false);
	// The pointer is on a waypoint or a control: the "+" steps aside.
	const [onGrip, setOnGrip] = useState(false);
	const setPendingInsert = useSetAtom(PendingEdgeInsertAtom);
	const setWorkflow = useSetAtom(WorkflowAtom);
	const { screenToFlowPosition } = useReactFlow();
	// Debug mode: the wire from the step that ran to the one Continue runs flows;
	// the rest step back.
	const debug = useAtomValue(DebugSessionAtom);
	const debugPath = !!debug && debug.state.status === "paused"
		&& debug.state.ran?.actionId === source && debug.state.nextActionId === target;
	const debugDimmed = !!debug && !debugPath;

	// While something is dragged, the wire follows it here; it's written once dropped.
	const [draft, setDraft] = useState<{ grip: Grip; waypoints: IWaypoint[] } | null>(null);
	// The waypoint clicked — Delete / Backspace removes it, Escape lets it go.
	const [picked, setPicked] = useState<number | null>(null);
	const stored = (data as IConnectionRuntime | undefined)?.waypoints ?? [];
	const waypoints = draft?.waypoints ?? stored;
	const from = { x: sourceX, y: sourceY };
	const to = { x: targetX, y: targetY };

	// No waypoints of its own: a loop takes its route round below both nodes.
	const sourceBox = boxOf(useInternalNode(source));
	const targetBox = boxOf(useInternalNode(target));
	const auto = waypoints.length === 0 && sourceBox && targetBox ? loopWaypoints(from, to, sourceBox, targetBox) : [];
	const route = waypoints.length > 0 ? waypoints : auto;

	const [edgePath, labelX, labelY] = route.length > 0
		? (({ path, labelX, labelY }) => [path, labelX, labelY] as const)(wirePath(from, route, to))
		: getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
	const controls = wireHandles(from, waypoints, to);

	const change = (apply: (data: IWorkflowRuntime) => IWorkflowRuntime) =>
		setWorkflow(prev => prev && { ...prev, data: apply(prev.data) });

	const onAdd = (e: React.MouseEvent) => {
		e.stopPropagation();
		setHovered(false);
		setPendingInsert({
			screenPosition: { x: e.clientX, y: e.clientY },
			connectionId: id,
			source,
			target,
			sourceHandle: sourceHandleId ?? "default",
			targetHandle: targetHandleId ?? "default",
		});
	};

	// A waypoint where the wire was double-clicked, on the stretch clicked. On
	// a loop's own route, that route is written too — it keeps its curve.
	const onAddWaypoint = (e: React.MouseEvent) => {
		e.stopPropagation();
		const point = screenToFlowPosition({ x: e.clientX, y: e.clientY });
		if (stored.length === 0 && auto.length > 0) {
			const index = waypointInsertIndex(from, auto, to, point);
			const next = [...auto.slice(0, index), point, ...auto.slice(index)];
			change(workflow => new SetConnectionWaypoints().execute(workflow, id, next));
			return;
		}
		const index = waypointInsertIndex(from, stored, to, point);
		change(workflow => new AddConnectionWaypoint().execute(workflow, id, index, point));
	};

	// ── dragging a waypoint or a control ──────────────────────────────────────

	const onGripDown = (grip: Grip) => (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		setDraft({ grip, waypoints: stored });
	};

	const onGripMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!draft || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
		const pointer = screenToFlowPosition({ x: e.clientX, y: e.clientY });
		const { index, part } = draft.grip;
		setDraft({
			...draft,
			waypoints: draft.waypoints.map((old, i) => {
				if (i !== index) return old;
				if (part === "point") return { ...old, x: pointer.x, y: pointer.y };
				// The control on the way out is the handle; the one in mirrors it.
				const handle = part === "out"
					? { x: pointer.x - old.x, y: pointer.y - old.y }
					: { x: old.x - pointer.x, y: old.y - pointer.y };
				return { ...old, handle };
			}),
		});
	};

	const onGripUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!draft) return;
		e.currentTarget.releasePointerCapture(e.pointerId);
		const { index, part } = draft.grip;
		const moved = draft.waypoints[index];
		const before = stored[index];
		setDraft(null);
		if (!moved || !before) return;
		if (part === "point") {
			const distance = Math.hypot(moved.x - before.x, moved.y - before.y);
			// A click, not a drag: it's picked.
			if (distance < 3) return setPicked(index);
			change(workflow => new MoveConnectionWaypoint().execute(workflow, id, index, moved));
			setPicked(index);
		}
		if (part !== "point" && moved.handle && (moved.handle.x !== before.handle?.x || moved.handle.y !== before.handle?.y)) {
			change(workflow => new SetConnectionWaypointHandle().execute(workflow, id, index, moved.handle!));
		}
	};

	const removeWaypoint = (index: number) => {
		setPicked(null);
		setOnGrip(false);
		change(workflow => new RemoveConnectionWaypoint().execute(workflow, id, index));
	};

	// Double-click: a waypoint goes; a control goes back to the worked-out curve.
	const onGripDoubleClick = ({ index, part }: Grip) => (e: React.MouseEvent) => {
		e.stopPropagation();
		if (part === "point") return removeWaypoint(index);
		change(workflow => new SetConnectionWaypointHandle().execute(workflow, id, index, null));
	};

	// A picked waypoint is let go by a click anywhere but this wire's points — or once it's gone.
	useEffect(() => {
		if (picked !== null && picked >= stored.length) setPicked(null);
	}, [picked, stored.length]);
	useEffect(() => {
		if (picked === null) return;
		const onDown = (e: PointerEvent) => {
			if (!(e.target instanceof Element) || !e.target.closest(`[data-wire-grip="${id}"]`)) setPicked(null);
		};
		window.addEventListener("pointerdown", onDown, true);
		return () => window.removeEventListener("pointerdown", onDown, true);
	}, [picked, id]);

	// Delete / Backspace removes the picked waypoint — caught before React
	// Flow's own Delete, which would take the whole (selected) wire with it.
	useEffect(() => {
		if (picked === null) return;
		const onKey = (e: KeyboardEvent) => {
			const el = document.activeElement as HTMLElement | null;
			if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || el.closest(".monaco-editor"))) return;
			if (e.key === "Delete" || e.key === "Backspace") {
				e.preventDefault();
				e.stopPropagation();
				removeWaypoint(picked);
			} else if (e.key === "Escape") {
				setPicked(null);
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [picked]);

	const gripProps = (grip: Grip, at: { x: number; y: number }) => ({
		onPointerDown: onGripDown(grip),
		onPointerMove: onGripMove,
		onPointerUp: onGripUp,
		onDoubleClick: onGripDoubleClick(grip),
		onMouseEnter: () => { setHovered(true); setOnGrip(true); },
		onMouseLeave: () => { setHovered(false); setOnGrip(false); },
		"data-wire-grip": id,
		style: {
			position: "absolute" as const,
			transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)`,
			pointerEvents: "all" as const,
		},
	});

	const showWaypoints = waypoints.length > 0 && (hovered || selected || draft !== null || picked !== null);
	// The controls: on the selected wire (or while one is dragged).
	const showControls = waypoints.length > 0 && (selected || (draft !== null && draft.grip.part !== "point"));

	return (

		<>

			<BaseEdge
				id={id}
				path={edgePath}
				style={{
					strokeWidth: 2,
					...style,
					...(debugDimmed && { opacity: 0.35 }),
					...(debugPath && { stroke: "var(--accent-line)", strokeWidth: 3 }),
					...((hovered || selected) && { stroke: "var(--accent-line)" }),
				}}
				markerEnd={markerEnd}
			/>

			{debugPath && (
				<path d={edgePath} fill="none" stroke="var(--accent)" strokeWidth={3} strokeDasharray="6 10" strokeLinecap="round" style={{ pointerEvents: "none" }}>
					<animate attributeName="stroke-dashoffset" from="32" to="0" dur="0.8s" repeatCount="indefinite" />
				</path>
			)}

			{/* Each waypoint's arms, out to its two controls. */}
			{showControls && controls.map((control, index) => {
				const point = waypoints[index]!;
				return (
					<g key={index} style={{ pointerEvents: "none" }}>
						<line x1={control.in.x} y1={control.in.y} x2={point.x} y2={point.y} stroke="var(--accent-line)" strokeWidth={1} strokeDasharray="3 3" />
						<line x1={point.x} y1={point.y} x2={control.out.x} y2={control.out.y} stroke="var(--accent-line)" strokeWidth={1} strokeDasharray="3 3" />
					</g>
				);
			})}

			{/* nopan: React Flow's double-click zoom leaves it alone — a double-click here bends the wire. */}
			<path
				d={edgePath}
				fill="none"
				stroke="transparent"
				strokeWidth={20}
				className="nopan"
				style={{ pointerEvents: "stroke" }}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				onDoubleClick={onAddWaypoint}
			/>

			<EdgeLabelRenderer>

				{/* The wrapper places it; the shape inside grows on hover — a scale on the
				    positioned element would scale its translate too, and throw it off. */}
				{showControls && controls.flatMap((control, index) => (["in", "out"] as const).map(part => (
					<div
						key={`${index}-${part}`}
						{...gripProps({ index, part }, control[part])}
						title={control.custom ? "Drag to shape the curve · double-click for the automatic one" : "Drag to shape the curve"}
						className="group/control nodrag nopan flex size-4 items-center justify-center cursor-grab active:cursor-grabbing"
					>
						<span className={clsx(
							"size-2 rotate-45 border border-accent shadow-[0_1px_4px_rgb(0_0_0/0.4)] transition-transform duration-100 group-hover/control:scale-150",
							control.custom ? "bg-accent" : "bg-overlay",
						)} />
					</div>
				)))}

				{showWaypoints && waypoints.map((point, index) => (
					<div
						key={index}
						{...gripProps({ index, part: "point" }, point)}
						title="Drag to move · click and Delete, or double-click, to remove"
						className="group/waypoint nodrag nopan flex size-5 items-center justify-center cursor-grab active:cursor-grabbing"
					>
						<span className={clsx(
							"size-3 rounded-full border-2 border-accent shadow-[0_1px_6px_rgb(0_0_0/0.4)] transition-transform duration-100 group-hover/waypoint:scale-125",
							picked === index ? "bg-accent ring-4 ring-accent/25" : "bg-overlay",
						)} />
					</div>
				))}

				{picked !== null && waypoints[picked] && draft === null && (
					<button
						type="button"
						onClick={e => { e.stopPropagation(); removeWaypoint(picked); }}
						onMouseEnter={() => setOnGrip(true)}
						onMouseLeave={() => setOnGrip(false)}
						style={{
							position: "absolute",
							transform: `translate(-50%, -50%) translate(${waypoints[picked]!.x + 18}px, ${waypoints[picked]!.y - 18}px)`,
							pointerEvents: "all",
						}}
						aria-label="Remove the point"
						data-wire-grip={id}
						title="Remove the point (Delete)"
						className="nodrag nopan flex items-center justify-center size-5 rounded-full cursor-pointer bg-overlay border border-line-strong text-danger shadow-[0_2px_8px_rgb(0_0_0/0.35)] transition-colors duration-150 hover:bg-danger hover:border-danger hover:text-on-accent"
					>
						<X size={11} strokeWidth={2.5} />
					</button>
				)}

				{hovered && !onGrip && draft === null && (
					<button
						type="button"
						onClick={onAdd}
						onMouseEnter={() => setHovered(true)}
						onMouseLeave={() => setHovered(false)}
						style={{
							position: "absolute",
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
							pointerEvents: "all",
						}}
						aria-label="Add action"
						title="Add action · double-click the wire to bend it"
						className="group nodrag nopan flex items-center justify-center size-6 rounded-full cursor-pointer bg-overlay border border-line-strong text-accent shadow-[0_2px_10px_rgb(0_0_0/0.35)] transition-colors duration-150 hover:bg-accent hover:border-accent hover:text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
					>
						<Plus size={13} strokeWidth={2.5} className="shrink-0 transition-transform duration-150 group-hover:rotate-90" />
					</button>
				)}

			</EdgeLabelRenderer>

		</>

	);

};
