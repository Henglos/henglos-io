import { useAtom, useAtomValue } from "jotai";
import type { IActionSchema, IComponentRuntime } from "@henglosio/workflow";
import { FloatingActionPicker } from "@/features/studio/components/FloatingActionPicker/FloatingActionPicker.component";
import { RegisteredActionsList } from "@/features/studio/components/RegisteredActionsList/RegisteredActionsList.component";
import { PendingAddActionAtom } from "@/features/studio/store/canvas.store";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";

/**
 * Overlay que aparece ao clicar no "+" do Explorer — escolhe uma action de
 * um componente já registrado no workflow e adiciona ela solta (sem mexer
 * em connections, diferente do EdgeInsertActionStore).
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
