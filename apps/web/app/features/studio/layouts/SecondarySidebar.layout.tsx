import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Sidebar } from "@/shared/components/Sidebar.component";
import { ActionStoreTargetAtom, CodeEditorTargetAtom, ComponentStoreOpenAtom, START_NODE_ID, WorkspaceSelectionAtom } from "../store/canvas.store";
import { WorkflowAtom } from "../store/workflow.store";
import { DebugSessionAtom } from "../store/debug.store";
import { ActionStore } from "../features/action-store/ActionStore.feature";
import { ComponentStore } from "../features/component-store/ComponentStore.feature";
import { CodeEditor } from "../features/code-editor/CodeEditor.feature";
import { ActionInspector } from "../features/action-inspector/ActionInspector.feature";
import { useSelectedAction } from "../hooks/useSelectedAction";
import { NODE_LAYOUT } from "../lib/nodeLayout";

export const SecondarySidebarLayout = () => {

	const codeEditorTarget = useAtomValue(CodeEditorTargetAtom);
	const actionTarget = useAtomValue(ActionStoreTargetAtom);
	const componentStoreOpen = useAtomValue(ComponentStoreOpenAtom);
	const { component, action } = useSelectedAction();
	const inspecting = NODE_LAYOUT === "sidebar" && !!action && !!component;

	useFollowDebugger();

	if (!codeEditorTarget && !actionTarget && !componentStoreOpen && !inspecting) return null;

	// One content at a time in this panel: the code editor first, then the
	// stores, then the inspector of the selected action.
	return (

		<Sidebar side="left" className={codeEditorTarget ? "w-xl" : inspecting && !actionTarget && !componentStoreOpen ? "w-96" : "w-80"}>
			{codeEditorTarget ? <CodeEditor />
				: actionTarget ? <ActionStore />
				: componentStoreOpen ? <ComponentStore />
				: <ActionInspector />}
		</Sidebar>

	);

}

// Debug mode with an inspector (sidebar or bottom panel): each step selects
// the action that just ran, so the inspector shows its values (and lets them
// be edited) as the flow moves.
function useFollowDebugger() {

	const session = useAtomValue(DebugSessionAtom);
	const workflow = useAtomValue(WorkflowAtom);
	const setSelection = useSetAtom(WorkspaceSelectionAtom);
	const ranActionId = session?.state.ran?.actionId ?? null;
	const step = session?.state.step;

	// Which component holds the action that ran — the selection names both (Start is its own).
	const componentId = !ranActionId ? null
		: workflow?.data.start.id === ranActionId ? START_NODE_ID
		: workflow?.data.components.find(found => found.actions.some(candidate => candidate.id === ranActionId))?.id ?? null;

	// Only on a new step: selecting something else meanwhile is the user's call.
	useEffect(() => {
		if (NODE_LAYOUT === "inline" || !ranActionId || !componentId) return;
		setSelection([{ componentId, actionId: [ranActionId] }]);
	}, [ranActionId, componentId, step, setSelection]);

}
