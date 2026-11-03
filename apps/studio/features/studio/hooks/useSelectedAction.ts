import { useAtomValue } from "jotai";
import { START_NODE_ID, WorkspaceSelectionAtom } from "../store/canvas.store";
import { WorkflowAtom } from "../store/workflow.store";
import { startAsComponent } from "../components/ActionNode/lib/startAsComponent";

export function useSelectedAction() {

	const selection = useAtomValue(WorkspaceSelectionAtom);
	const workflow = useAtomValue(WorkflowAtom);

	const selected = selection.flatMap(s => s.actionId.map(actionId => ({ componentId: s.componentId, actionId })));

	if (selected.length !== 1 || !workflow) {
		return { count: selected.length, board: workflow?.data.board ?? null, component: null, action: null };
	}

	const { componentId, actionId } = selected[0]!;

	if (componentId === START_NODE_ID) {

		const start = workflow.data.start;
		if (start.id !== actionId) return { count: selected.length, board: workflow.data.board, component: null, action: null };

		return { count: selected.length, board: workflow.data.board, component: startAsComponent(start), action: start };

	}

	const component = workflow.data.components.find(c => c.id === componentId) ?? null;
	const action = component?.actions.find(a => a.id === actionId) ?? null;

	return { count: selected.length, board: workflow.data.board, component, action };

}
