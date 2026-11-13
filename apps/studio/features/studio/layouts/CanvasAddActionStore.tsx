import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useReactFlow, useStoreApi } from "@xyflow/react";
import type { IActionSchema, IComponentRuntime } from "@henglosio/workflow";
import { FloatingActionPicker } from "../components/FloatingActionPicker/FloatingActionPicker.component";
import { RegisteredActionsList } from "../components/RegisteredActionsList/RegisteredActionsList.component";
import { NodePositionOverrideAtom, PendingCanvasAddActionAtom } from "../store/canvas.store";
import { WorkflowAtom } from "../store/workflow.store";
import { useWorkflowMutate } from "../hooks/useWorkflowMutate";

/**
 * Overlay of the canvas toolbox's "+" — the same picker as the Explorer's (the
 * actions of the components already registered), but the new action shows up
 * in the middle of what the canvas is showing. Lives inside the
 * ReactFlowProvider because of screenToFlowPosition.
 */
export const CanvasAddActionStore = () => {

	const [pending, setPending] = useAtom(PendingCanvasAddActionAtom);
	const workflow = useAtomValue(WorkflowAtom);
	const setPositionOverrides = useSetAtom(NodePositionOverrideAtom);
	const { screenToFlowPosition } = useReactFlow();
	const storeApi = useStoreApi();
	const mutate = useWorkflowMutate();

	const close = () => setPending(null);

	const onSelect = async (component: IComponentRuntime, action: IActionSchema) => {

		close();

		// Where the view's middle is now — read before the mutation re-renders anything.
		const rect = storeApi.getState().domNode?.getBoundingClientRect();
		const position = rect ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : null;

		const previousActionIds = new Set(component.actions.map(a => a.id));

		const updated = await mutate({ op: "add:action", componentId: component.id, actionName: action.displayName });
		if (!position) return;

		const newAction = updated?.data.components
			.find(c => c.id === component.id)
			?.actions.find(a => !previousActionIds.has(a.id));
		if (!newAction) return;

		setPositionOverrides(prev => ({ ...prev, [newAction.id]: position }));

	};

	return (
		<FloatingActionPicker screenPosition={pending?.screenPosition ?? null} onClose={close}>
			<RegisteredActionsList components={workflow?.data.components ?? []} onSelect={onSelect} />
		</FloatingActionPicker>
	);

};
