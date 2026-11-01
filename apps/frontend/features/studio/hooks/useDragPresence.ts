import { useCallback, useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import type { NodeChange } from "@xyflow/react";
import { WorkflowCollabAtom, type FlowPoint } from "../store/collab.store";

// Same cadence as the cursor — smooth enough, far below the pointer rate.
const PUBLISH_INTERVAL_MS = 50;

// The final position goes out through the doc on drag stop; clearing the
// awareness entry right away could reach a peer first and snap the node back
// to its old spot for a frame. Wait a bit so the doc update lands first.
const CLEAR_DELAY_MS = 300;

/**
 * Streams the positions of the nodes this client is dragging through Yjs
 * awareness, so peers see them move live (useWorkflowCollab turns that into
 * CollabRemoteDragsAtom). Feed it every ReactFlow NodeChange batch.
 */
export function useDragPresence() {
	const collab = useAtomValue(WorkflowCollabAtom);
	const dragging = useRef<Record<string, FlowPoint>>({});
	const lastSent = useRef(0);
	const pending = useRef<ReturnType<typeof setTimeout>>(undefined);

	const send = useCallback(() => {
		const awareness = collab?.provider.awareness;
		if (!awareness) return;
		const drag = Object.keys(dragging.current).length > 0 ? { ...dragging.current } : null;
		awareness.setLocalStateField("drag", drag);
		lastSent.current = Date.now();
	}, [collab]);

	const onNodeChanges = useCallback((changes: NodeChange[]) => {
		let moved = false;
		let ended = false;

		for (const change of changes) {
			if (change.type !== "position") continue;
			if (change.dragging && change.position) {
				dragging.current[change.id] = change.position;
				moved = true;
			} else if (change.dragging === false && change.id in dragging.current) {
				delete dragging.current[change.id];
				ended = true;
			}
		}

		if (!moved && !ended) return;
		clearTimeout(pending.current);

		if (moved) {
			const wait = PUBLISH_INTERVAL_MS - (Date.now() - lastSent.current);
			// Trailing call, so the last frame of a drag always goes out.
			if (wait <= 0) send();
			else pending.current = setTimeout(send, wait);
		} else {
			pending.current = setTimeout(send, CLEAR_DELAY_MS);
		}
	}, [send]);

	useEffect(() => () => {
		clearTimeout(pending.current);
		collab?.provider.awareness?.setLocalStateField("drag", null);
	}, [collab]);

	return onNodeChanges;
}
