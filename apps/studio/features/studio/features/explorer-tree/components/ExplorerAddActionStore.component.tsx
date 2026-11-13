import { useAtom, useAtomValue } from "jotai";
import type { IActionSchema, IComponentRuntime } from "@henglosio/workflow";
import { FloatingActionPicker } from "@/features/studio/components/FloatingActionPicker/FloatingActionPicker.component";
import { RegisteredActionsList } from "@/features/studio/components/RegisteredActionsList/RegisteredActionsList.component";
import { PendingAddActionAtom } from "@/features/studio/store/canvas.store";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";

/**
 * Overlay shown when clicking the Explorer's "+" — picks an action of a
 * component already in the workflow and adds it loose (without touching
 * connections, unlike EdgeInsertActionStore).
 */
export const ExplorerAddActionStore = () => {

	const [pending, setPending] = useAtom(PendingAddActionAtom);
	const workflow = useAtomValue(WorkflowAtom);
	const mutate = useWorkflowMutate();

	const close = () => setPending(null);

	const onSelect = (component: IComponentRuntime, action: IActionSchema) => {
		close();
		mutate({ op: "add:action", componentId: component.id, actionName: action.displayName });
	};

	return (
		<FloatingActionPicker screenPosition={pending?.screenPosition ?? null} onClose={close}>
			<RegisteredActionsList components={workflow?.data.components ?? []} onSelect={onSelect} />
		</FloatingActionPicker>
	);

};
