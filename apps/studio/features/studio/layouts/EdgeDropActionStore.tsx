import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type { IActionSchema, IComponentRuntime } from "@henglosio/workflow";
import { FloatingActionPicker } from "../components/FloatingActionPicker/FloatingActionPicker.component";
import { RegisteredActionsList } from "../components/RegisteredActionsList/RegisteredActionsList.component";
import { NodePositionOverrideAtom, PendingEdgeDropAtom } from "../store/canvas.store";
import { WorkflowAtom } from "../store/workflow.store";
import { useWorkflowMutate } from "../hooks/useWorkflowMutate";

/**
 * Overlay shown when a connection is dropped on an empty spot of the canvas —
 * the same picker as the Explorer's "+" (the actions of every component
 * already in the workflow, grouped by component). Picking one adds the action
 * and connects the pending edge to it, whether the drag started on an output
 * handle or an input one.
 */
export const EdgeDropActionStore = () => {

	const [pending, setPending] = useAtom(PendingEdgeDropAtom);
	const workflow = useAtomValue(WorkflowAtom);
	const setPositionOverrides = useSetAtom(NodePositionOverrideAtom);
	const mutate = useWorkflowMutate();

	const close = () => setPending(null);

	const onSelect = async (component: IComponentRuntime, action: IActionSchema) => {

		if (!pending) return;
		const drop = pending;
		close();

		const previousActionIds = new Set(component.actions.map(a => a.id));

		const updated = await mutate({ op: "add:action", componentId: component.id, actionName: action.displayName });
		const result = updated?.data.components.find(c => c.id === component.id);
		if (!result) return;

		const newAction = result.actions.find(a => !previousActionIds.has(a.id));
		if (!newAction) return;

		setPositionOverrides(prev => ({ ...prev, [newAction.id]: drop.flowPosition }));

		// When the drag started on an output handle, the dragged node is the
		// source and the new action the target — and the other way around when
		// it started on an input.
		const draggedIsSource = drop.sourceHandleType === "source";

		mutate({
			op: "add:connection",
			connection: {
				id: crypto.randomUUID(),
				source: draggedIsSource ? drop.sourceNodeId : newAction.id,
				target: draggedIsSource ? newAction.id : drop.sourceNodeId,
				sourceHandle: draggedIsSource ? (drop.sourceHandleId ?? "default") : (newAction.outputs[0]?.id ?? "default"),
				targetHandle: draggedIsSource ? (newAction.inputs[0]?.id ?? "default") : (drop.sourceHandleId ?? "default"),
			},
		});

	};

	return (
		<FloatingActionPicker screenPosition={pending?.screenPosition ?? null} onClose={close}>
			<RegisteredActionsList components={workflow?.data.components ?? []} onSelect={onSelect} />
		</FloatingActionPicker>
	);

};
