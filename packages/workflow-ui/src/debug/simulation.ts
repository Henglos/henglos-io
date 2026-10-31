import { useCallback, useMemo, useState } from "react";
import { getActionOutputs, type IActionRuntime, type IWorkflowRuntime } from "@henglosio/workflow";

// A debug session played on the canvas, without a board: where the flow is
// (the node that ran, the one that runs next), step by step — the studio's
// debug mode, for docs and previews. Moved by hand: next() follows the wires,
// select() puts it on any node.

/** A value shown under an output of the node that ran — what a step published. */
export type DebugValue = string | number | boolean | null | unknown[] | Record<string, unknown>;

/** Where a simulated debug session stands — the shape WorkflowViewer's `debug` takes. */
export type DebugSimulationState = {
	/** idle: no session. paused: waiting for the next step. finished: the flow is over. */
	status: "idle" | "paused" | "finished";
	/** How many steps ran. */
	step: number;
	/** The node that just ran, and the output it ended on. */
	ranId: string | null;
	ranOutput: string | null;
	/** What runs next — null when the flow is over. */
	nextId: string | null;
	/** What each node published, by node id → output name — shown under its outputs. */
	values: Record<string, Record<string, DebugValue>>;
};

/** No session. */
export const IDLE_DEBUG: DebugSimulationState = { status: "idle", step: 0, ranId: null, ranOutput: null, nextId: null, values: {} };

const allNodes = (workflow: IWorkflowRuntime): IActionRuntime[] => [
	workflow.start,
	...workflow.components.flatMap(component => component.actions),
];

/** A node's outputs: Start's as they are, an action's with its Fallback. */
const outputsOf = (workflow: IWorkflowRuntime, node: IActionRuntime) =>
	node.id === workflow.start.id ? node.outputs : getActionOutputs(node);

/**
 * The output a node ends on: the one named `output` (any case), or its first
 * real one (not Fallback) — undefined when it has none of that name.
 */
export function outputOf(workflow: IWorkflowRuntime, nodeId: string, output?: string) {
	const node = allNodes(workflow).find(found => found.id === nodeId);
	if (!node) return undefined;
	const outputs = outputsOf(workflow, node);
	return output
		? outputs.find(handle => handle.base.name.toLowerCase() === output.toLowerCase() || handle.base.id === output)
		: outputs.find(handle => handle.base.id !== "fallback") ?? outputs[0];
}

/** Where the flow goes from `nodeId` ending on `output` — the node wired to it, or null. */
export function nextNodeOf(workflow: IWorkflowRuntime, nodeId: string, output?: string): string | null {
	const handle = outputOf(workflow, nodeId, output);
	if (!handle) return null;
	return workflow.connections.find(connection => connection.source === nodeId && connection.sourceHandle === handle.id)?.target ?? null;
}

/** A debug session played without a board (docs, previews): its state and the controls. */
export type DebugSimulation = {
	state: DebugSimulationState;
	/** Opens a session paused before `entryId` (Start by default, or a trigger). */
	start: (entryId?: string) => void;
	/**
	 * Runs the next node: it ends on `output` (by name — "True", "Case 2",
	 * "Fallback"; default its first) and the flow moves to what that output is
	 * wired to. `values`: what it published, shown under its outputs.
	 */
	next: (output?: string, values?: Record<string, DebugValue>) => void;
	/**
	 * Puts the session on `nodeId`: what runs next (default), or — `as: "ran"`
	 * — the node that just ran, ending on `output`, the next one being where
	 * that output goes.
	 */
	select: (nodeId: string, options?: { as?: "next" | "ran"; output?: string }) => void;
	/** What `nodeId` published — shown under its outputs. */
	setValues: (nodeId: string, values: Record<string, DebugValue>) => void;
	/** Ends the session. */
	stop: () => void;
};

/** A debug session to play on a WorkflowViewer: pass `state` as its `debug`, `next` as its `onDebugContinue`. */
export function useDebugSimulation(workflow: IWorkflowRuntime): DebugSimulation {

	const [state, setState] = useState<DebugSimulationState>(IDLE_DEBUG);

	const start = useCallback((entryId?: string) => {
		setState({ ...IDLE_DEBUG, status: "paused", nextId: entryId ?? workflow.start.id });
	}, [workflow]);

	const next = useCallback((output?: string, values?: Record<string, DebugValue>) => {
		setState(current => {
			if (current.status !== "paused" || !current.nextId) return current;
			const ran = current.nextId;
			const handle = outputOf(workflow, ran, output);
			const nextId = nextNodeOf(workflow, ran, handle?.base.name);
			return {
				...current,
				status: nextId ? "paused" : "finished",
				step: current.step + 1,
				ranId: ran,
				ranOutput: handle?.base.name ?? output ?? null,
				nextId,
				values: values ? { ...current.values, [ran]: values } : current.values,
			};
		});
	}, [workflow]);

	const select = useCallback((nodeId: string, options?: { as?: "next" | "ran"; output?: string }) => {
		setState(current => {
			if (options?.as === "ran") {
				const handle = outputOf(workflow, nodeId, options.output);
				const nextId = nextNodeOf(workflow, nodeId, handle?.base.name);
				return { ...current, status: nextId ? "paused" : "finished", step: Math.max(current.step, 1), ranId: nodeId, ranOutput: handle?.base.name ?? null, nextId };
			}
			return { ...current, status: "paused", nextId: nodeId };
		});
	}, [workflow]);

	const setValues = useCallback((nodeId: string, values: Record<string, DebugValue>) => {
		setState(current => ({ ...current, values: { ...current.values, [nodeId]: values } }));
	}, []);

	const stop = useCallback(() => setState(IDLE_DEBUG), []);

	return useMemo(() => ({ state, start, next, select, setValues, stop }), [state, start, next, select, setValues, stop]);

}
