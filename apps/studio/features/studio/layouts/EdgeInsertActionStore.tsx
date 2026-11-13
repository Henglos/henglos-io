import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type { IActionRuntime, IActionSchema, IComponentRuntime, IWorkflowRuntime } from "@henglosio/workflow";
import { FloatingActionPicker } from "../components/FloatingActionPicker/FloatingActionPicker.component";
import { RegisteredActionsList } from "../components/RegisteredActionsList/RegisteredActionsList.component";
import { NodePositionOverrideAtom, PendingEdgeInsertAtom, WorkspaceNodesAtom } from "../store/canvas.store";
import { WorkflowAtom } from "../store/workflow.store";
import { useWorkflowMutate } from "../hooks/useWorkflowMutate";

const findAction = (data: IWorkflowRuntime, actionId: string): IActionRuntime | undefined => {
	if (data.start.id === actionId) return data.start;
	return data.components.flatMap(c => c.actions).find(a => a.id === actionId);
};

/**
 * Overlay shown when clicking the "+" button of an existing connection.
 * Picking an action inserts it between the two connected actions — removes
 * the original connection and creates two new ones (source → new action → target).
 */
export const EdgeInsertActionStore = () => {

	const [pending, setPending] = useAtom(PendingEdgeInsertAtom);
	const workflow = useAtomValue(WorkflowAtom);
	const nodes = useAtomValue(WorkspaceNodesAtom);
	const setPositionOverrides = useSetAtom(NodePositionOverrideAtom);
	const mutate = useWorkflowMutate();

	const close = () => setPending(null);

	const onSelect = async (component: IComponentRuntime, action: IActionSchema) => {

		if (!pending || !workflow) return;
		const insert = pending;
		close();

		// Resolves the two actions the clicked connection linked — if either
		// is gone by now (e.g. deleted while the popover was open), aborts
		// instead of creating a connection to an id that doesn't exist.
		const leftAction = findAction(workflow.data, insert.source);
		const rightAction = findAction(workflow.data, insert.target);
		if (!leftAction || !rightAction) return;

		// The output/input the original connection used on each one — not
		// necessarily the action's first pin, but exactly the one that was
		// connected (an action can have more than one output, e.g. "fallback").
		// Checks the handle still exists on that action; otherwise falls back to
		// the raw id saved on click (the same behavior as before).
		const leftOutputHandle = leftAction.outputs.find(h => h.id === insert.sourceHandle)?.id ?? insert.sourceHandle;
		const rightInputHandle = rightAction.inputs.find(h => h.id === insert.targetHandle)?.id ?? insert.targetHandle;

		const previousActionIds = new Set(component.actions.map(a => a.id));

		const updated = await mutate({ op: "add:action", componentId: component.id, actionName: action.displayName });
		const result = updated?.data.components.find(c => c.id === component.id);
		if (!result) return;

		const newAction = result.actions.find(a => !previousActionIds.has(a.id));
		if (!newAction) return;

		// Places the new action halfway between the left and the right one,
		// instead of the default corner — it is literally between the two in
		// the graph, so it makes sense for it to be between them on the canvas.
		const leftNode = nodes.find(n => n.id === leftAction.id);
		const rightNode = nodes.find(n => n.id === rightAction.id);
		if (leftNode && rightNode) {
			setPositionOverrides(prev => ({
				...prev,
				[newAction.id]: {
					x: (leftNode.position.x + rightNode.position.x) / 2,
					y: (leftNode.position.y + rightNode.position.y) / 2,
				},
			}));
		}

		const newActionInputHandle = newAction.inputs[0]?.id ?? "default";
		const newActionOutputHandle = newAction.outputs[0]?.id ?? "default";

		await mutate(
			{ op: "remove:connection", connectionId: insert.connectionId },
			{
				op: "add:connection",
				connection: {
					id: crypto.randomUUID(),
					source: leftAction.id,
					target: newAction.id,
					sourceHandle: leftOutputHandle,
					targetHandle: newActionInputHandle,
				},
			},
			{
				op: "add:connection",
				connection: {
					id: crypto.randomUUID(),
					source: newAction.id,
					target: rightAction.id,
					sourceHandle: newActionOutputHandle,
					targetHandle: rightInputHandle,
				},
			},
		);

	};

	return (
		<FloatingActionPicker screenPosition={pending?.screenPosition ?? null} onClose={close}>
			<RegisteredActionsList components={workflow?.data.components ?? []} onSelect={onSelect} />
		</FloatingActionPicker>
	);

};
