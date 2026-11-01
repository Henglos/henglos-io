import { useCallback, useEffect } from "react";
import { useAtomValue } from "jotai";
import { WorkflowCollabAtom, WorkflowHistoryAtom } from "../store/collab.store";

/**
 * Undo/redo over the collaborative doc. Only this tab's own edits are on the
 * stack (useWorkflowCollab's UndoManager tracks LOCAL_ORIGIN): undo never
 * reverts a collaborator's change, nor a server-side op such as adding a
 * component or switching the board.
 */
export function useWorkflowHistory() {
	const collab = useAtomValue(WorkflowCollabAtom);
	const { canUndo, canRedo } = useAtomValue(WorkflowHistoryAtom);

	const undo = useCallback(() => { collab?.undoManager.undo(); }, [collab]);
	const redo = useCallback(() => { collab?.undoManager.redo(); }, [collab]);

	return { undo, redo, canUndo, canRedo };
}

// Text fields (inputs, textareas, Monaco, contenteditable) keep their native
// text undo — the workflow history only takes the shortcut everywhere else.
const isTextTarget = (target: EventTarget | null) =>
	target instanceof HTMLElement
	&& (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true'], .monaco-editor") !== null);

/** Ctrl/⌘+Z undoes; Ctrl/⌘+Shift+Z and Ctrl+Y redo. Mount once, in the studio. */
export function useWorkflowHistoryShortcuts() {
	const { undo, redo } = useWorkflowHistory();

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextTarget(e.target)) return;

			const key = e.key.toLowerCase();
			if (key === "z" && !e.shiftKey) {
				e.preventDefault();
				undo();
			} else if ((key === "z" && e.shiftKey) || (key === "y" && !e.metaKey)) {
				e.preventDefault();
				redo();
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [undo, redo]);
}
