import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { ViewportPortal, useReactFlow, useStore, useStoreApi } from "@xyflow/react";
import { CollabPeersAtom, WorkflowCollabAtom } from "../../store/collab.store";

// How often this tab publishes its cursor. Awareness is cheap, but the
// pointer fires far faster than anyone can perceive.
const PUBLISH_INTERVAL_MS = 50;

/**
 * Publishes this tab's pointer (in flow coordinates, so it lands on the same
 * spot at any pan/zoom) and draws everyone else's. Must be rendered inside
 * <ReactFlow>.
 */
export const CollabCursors = () => {

	const collab = useAtomValue(WorkflowCollabAtom);
	const peers = useAtomValue(CollabPeersAtom);
	const { screenToFlowPosition } = useReactFlow();
	const storeApi = useStoreApi();
	// Cursors live inside the zoomed viewport; scale them back so they stay the same size.
	const zoom = useStore(state => state.transform[2]);

	useEffect(() => {
		const awareness = collab?.provider.awareness;
		const pane = storeApi.getState().domNode;
		if (!awareness || !pane) return;

		let last = 0;
		let pending: ReturnType<typeof setTimeout> | undefined;

		const publish = (e: PointerEvent) => {
			awareness.setLocalStateField("cursor", screenToFlowPosition({ x: e.clientX, y: e.clientY }));
			last = Date.now();
		};

		const onMove = (e: PointerEvent) => {
			clearTimeout(pending);
			const wait = PUBLISH_INTERVAL_MS - (Date.now() - last);
			if (wait <= 0) publish(e);
			else pending = setTimeout(() => publish(e), wait); // trailing call, so the final position always goes out
		};

		const onLeave = () => {
			clearTimeout(pending);
			awareness.setLocalStateField("cursor", null);
		};

		pane.addEventListener("pointermove", onMove);
		pane.addEventListener("pointerleave", onLeave);
		return () => {
			clearTimeout(pending);
			pane.removeEventListener("pointermove", onMove);
			pane.removeEventListener("pointerleave", onLeave);
			awareness.setLocalStateField("cursor", null);
		};
	}, [collab, screenToFlowPosition, storeApi]);

	return (
		<ViewportPortal>
			{peers.map(peer => peer.cursor && (
				<div
					key={peer.clientId}
					className="absolute top-0 left-0 pointer-events-none z-50 transition-transform duration-75 ease-linear"
					style={{
						transform: `translate(${peer.cursor.x}px, ${peer.cursor.y}px) scale(${1 / zoom})`,
						transformOrigin: "0 0",
						color: peer.user.color,
					}}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="var(--canvas)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" className="drop-shadow-sm lucide lucide-mouse-pointer-2 preview-icon">
						<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />
					</svg>
					<span
						className="absolute top-4 left-4 px-2 rounded-sm text-xs font-medium whitespace-nowrap text-canvas"
						style={{ backgroundColor: peer.user.color }}
					>
						{peer.user.name}
					</span>
				</div>
			))}
		</ViewportPortal>
	);

};
