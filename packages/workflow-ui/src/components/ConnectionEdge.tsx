import { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import { loopWaypoints, wirePath, type IConnectionRuntime, type WireBox } from "@henglosio/workflow";
import { Plus } from "lucide-react";
import { useEdgeDecoration, useWorkflowCanvas } from "../context";

// A node's box on the canvas, once React Flow has measured it.
const boxOf = (node: InternalNode | undefined): WireBox | null =>
	node?.measured.width && node.measured.height
		? { ...node.internals.positionAbsolute, width: node.measured.width, height: node.measured.height }
		: null;

// A wire between two actions. On an editable canvas, hovering it offers "+"
// to insert an action in the middle; the app can highlight one (the path the
// flow takes next) and fade the rest. A wire with waypoints (bent in the
// studio) is drawn through them; a loop back to a node behind goes round below both.
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
	data,
}) => {

	const canvas = useWorkflowCanvas();
	const decoration = useEdgeDecoration({ id, source, target });
	const [hovered, setHovered] = useState(false);
	const insertable = !canvas.readOnly && !!canvas.onInsertOnEdge;

	const waypoints = (data as IConnectionRuntime | undefined)?.waypoints ?? [];
	const from = { x: sourceX, y: sourceY };
	const to = { x: targetX, y: targetY };
	const sourceBox = boxOf(useInternalNode(source));
	const targetBox = boxOf(useInternalNode(target));
	const route = waypoints.length > 0 ? waypoints : sourceBox && targetBox ? loopWaypoints(from, to, sourceBox, targetBox) : [];
	const [edgePath, labelX, labelY] = route.length > 0
		? (({ path, labelX, labelY }) => [path, labelX, labelY] as const)(wirePath(from, route, to))
		: getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

	const onAdd = (e: React.MouseEvent) => {
		e.stopPropagation();
		setHovered(false);
		canvas.onInsertOnEdge?.({
			screenPosition: { x: e.clientX, y: e.clientY },
			connectionId: id,
			source,
			target,
			sourceHandle: sourceHandleId ?? "default",
			targetHandle: targetHandleId ?? "default",
		});
	};

	return (

		<>

			<BaseEdge
				id={id}
				path={edgePath}
				style={{
					strokeWidth: 2,
					...style,
					...(decoration.dimmed && { opacity: 0.35 }),
					...(decoration.highlighted && { stroke: "var(--accent-line)", strokeWidth: 3 }),
					...(hovered && { stroke: "var(--accent-line)" }),
				}}
				markerEnd={markerEnd}
			/>

			{decoration.highlighted && (
				<path d={edgePath} fill="none" stroke="var(--accent)" strokeWidth={3} strokeDasharray="6 10" strokeLinecap="round" style={{ pointerEvents: "none" }}>
					<animate attributeName="stroke-dashoffset" from="32" to="0" dur="0.8s" repeatCount="indefinite" />
				</path>
			)}

			{insertable && (
				<path
					d={edgePath}
					fill="none"
					stroke="transparent"
					strokeWidth={20}
					style={{ pointerEvents: "stroke" }}
					onMouseEnter={() => setHovered(true)}
					onMouseLeave={() => setHovered(false)}
				/>
			)}

			{insertable && hovered && (
				<EdgeLabelRenderer>
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
						title="Add action"
						className="group nodrag nopan flex items-center justify-center size-6 rounded-full cursor-pointer bg-overlay border border-line-strong text-accent shadow-[0_2px_10px_rgb(0_0_0/0.35)] transition-colors duration-150 hover:bg-accent hover:border-accent hover:text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
					>
						<Plus size={13} strokeWidth={2.5} className="shrink-0 transition-transform duration-150 group-hover:rotate-90" />
					</button>
				</EdgeLabelRenderer>
			)}

		</>

	);

};
