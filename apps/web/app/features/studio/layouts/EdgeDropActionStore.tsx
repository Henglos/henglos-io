import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type { IActionSchema, IComponentRuntime } from "@henglosio/workflow";
import { FloatingActionPicker } from "../components/FloatingActionPicker/FloatingActionPicker.component";
import { RegisteredActionsList } from "../components/RegisteredActionsList/RegisteredActionsList.component";
import { NodePositionOverrideAtom, PendingEdgeDropAtom } from "../store/canvas.store";
import { WorkflowAtom } from "../store/workflow.store";
import { useWorkflowMutate } from "../hooks/useWorkflowMutate";

/**
 * Overlay que aparece ao soltar uma connection num espaço vazio do canvas —
 * mesmo picker do "+" do Explorer (actions de todos os componentes já
 * registrados no workflow, agrupadas por componente). Ao escolher uma,
 * adiciona a action e conecta automaticamente o edge pendente até ela,
 * respeitando se o drag começou num handle de saída ou de entrada.
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

		// Se o drag começou num handle de saída, o node arrastado é o source
		// e a nova action vira o target — e vice-versa se começou numa entrada.
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
