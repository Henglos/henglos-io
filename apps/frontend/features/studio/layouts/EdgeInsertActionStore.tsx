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
 * Overlay que aparece ao clicar no botão "+" de uma connection existente.
 * Ao escolher uma action, insere a action entre as duas actions conectadas —
 * remove a connection original e cria duas novas (source → nova action → target).
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

		// Resolve as duas actions que a connection clicada ligava — se alguma
		// delas sumiu nesse meio tempo (ex: apagada enquanto o popover estava
		// aberto), aborta em vez de criar uma connection pra um id inexistente.
		const leftAction = findAction(workflow.data, insert.source);
		const rightAction = findAction(workflow.data, insert.target);
		if (!leftAction || !rightAction) return;

		// O output/input que a connection original usava em cada uma — não é
		// necessariamente o primeiro pino da action, é especificamente o que
		// já estava conectado (uma action pode ter mais de uma saída, ex:
		// "fallback"). Confirma que o handle ainda existe nessa action;
		// senão cai pro id cru guardado no clique (mesmo comportamento de antes).
		const leftOutputHandle = leftAction.outputs.find(h => h.id === insert.sourceHandle)?.id ?? insert.sourceHandle;
		const rightInputHandle = rightAction.inputs.find(h => h.id === insert.targetHandle)?.id ?? insert.targetHandle;

		const previousActionIds = new Set(component.actions.map(a => a.id));

		const updated = await mutate({ op: "add:action", componentId: component.id, actionName: action.displayName });
		const result = updated?.data.components.find(c => c.id === component.id);
		if (!result) return;

		const newAction = result.actions.find(a => !previousActionIds.has(a.id));
		if (!newAction) return;

		// Posiciona a nova action no ponto médio entre a da esquerda e a da
		// direita, em vez de deixar no canto padrão — ela está literalmente
		// entre as duas no grafo, então faz sentido estar entre elas no canvas.
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
