import { useCallback, useRef } from "react";
import { useReactFlow, type Connection, type OnConnectEnd, type OnConnectStart } from "@xyflow/react";
import type { IWorkflowRuntime } from "@henglosio/workflow";
import { connectActions } from "../lib/graph";
import type { FlowPoint } from "../types";

/** A wire let go on empty canvas — e.g. to add an action there, already wired. */
export type PaneDrop = {
	screenPosition: FlowPoint;
	flowPosition: FlowPoint;
	sourceNodeId: string;
	sourceHandleId: string | null;
	sourceHandleType: "source" | "target";
};

type Options = {
	workflow: IWorkflowRuntime | null;
	/** The workflow with the new connection. */
	onChange: (workflow: IWorkflowRuntime) => void;
	onDropOnPane?: (drop: PaneDrop) => void;
};

/**
 * Connecting nodes on an editable canvas — React Flow's onConnect /
 * onConnectStart / onConnectEnd, wired to the workflow: a valid wire becomes a
 * connection (the workflow's rules decide — see AddConnectionToWorkflow), a
 * wire dropped on empty canvas is handed to `onDropOnPane`. Must be used
 * inside a ReactFlowProvider.
 */
export function useWorkflowConnections({ workflow, onChange, onDropOnPane }: Options) {

	const { screenToFlowPosition } = useReactFlow();
	// The handle the current drag started from — onConnectEnd doesn't get it.
	const startedRef = useRef<{ nodeId: string; handleId: string | null; handleType: "source" | "target" } | null>(null);

	const onConnect = useCallback((params: Connection) => {
		if (!workflow) return;
		const { workflow: next, connection } = connectActions(workflow, params);
		if (connection) onChange(next);
	}, [workflow, onChange]);

	const onConnectStart: OnConnectStart = useCallback((_event, { nodeId, handleId, handleType }) => {
		startedRef.current = { nodeId: nodeId ?? "", handleId, handleType: handleType ?? "source" };
	}, []);

	const onConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
		const started = startedRef.current;
		startedRef.current = null;
		// Landed on a handle — onConnect has it.
		if (connectionState.isValid || !started?.nodeId || !onDropOnPane) return;

		const point = "changedTouches" in event ? event.changedTouches[0]! : event as MouseEvent;
		const screenPosition = { x: point.clientX, y: point.clientY };

		onDropOnPane({
			screenPosition,
			flowPosition: screenToFlowPosition(screenPosition),
			sourceNodeId: started.nodeId,
			sourceHandleId: started.handleId,
			sourceHandleType: started.handleType,
		});
	}, [screenToFlowPosition, onDropOnPane]);

	return { onConnect, onConnectStart, onConnectEnd };

}
