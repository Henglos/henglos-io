import { useStore } from "jotai";
import { WorkflowAtom, WorkflowSavedCanvasAtom } from "../store/workflow.store";
import { WorkflowCollabSyncedAtom } from "../store/collab.store";
import { updateWorkflow } from "@shared/api";
import { WorkflowPatch } from "@henglosio/shared";
import type { WorkflowDetail } from "@shared/types/workflow.types";
import { applyLocalWorkflowOps, canApplyLocally, type WorkflowPatchInput } from "../lib/applyLocalWorkflowOps";

export function useWorkflowMutate() {
	// Reads through the store at call time, not a render-time closure: callers
	// chain mutations in one handler (add:action, then update its values) and
	// each must build on the previous result, which hasn't re-rendered yet.
	const store = useStore();

	return async (...operations: WorkflowPatchInput[]) => {
		const workflow = store.get(WorkflowAtom);
		if (!workflow) return;

		// With the collab doc open, pure ops are applied right here — the
		// atom → doc sync (useWorkflowCollab) writes them as local edits, so
		// they're instant and undoable.
		if (store.get(WorkflowCollabSyncedAtom) && canApplyLocally(operations)) {
			const updated = { ...workflow, data: applyLocalWorkflowOps(workflow.data, operations) };
			store.set(WorkflowAtom, updated);
			return updated;
		}

		const patch = operations.map(op => ({ path: "", ...op })) as WorkflowPatch[];
		const updated = await updateWorkflow(workflow.id, { patch });

		// With the collab doc open, the hosting merges this op into the doc and it
		// reaches every client (this one included) through it — setting the
		// response here too would race that and write it back as a local edit.
		// Wait for it to land instead, so a local op chained right after (add a
		// component, then an action on it) sees the new state.
		if (store.get(WorkflowCollabSyncedAtom)) {
			await waitForAtom(store, current => sameStructure(current.data, updated.data));
			return store.get(WorkflowAtom) ?? updated;
		}

		store.set(WorkflowAtom, updated);
		store.set(WorkflowSavedCanvasAtom, { start: updated.data.start, components: updated.data.components, connections: updated.data.connections });
		return updated;
	};
}

type Store = ReturnType<typeof useStore>;
type Workflow = WorkflowDetail;

// Server-side ops (add/remove:component, change:board) change the component
// set or the board — enough to tell the merged doc has reached this client.
const sameStructure = (a: Workflow["data"], b: Workflow["data"]) => {
	if (a.board.id !== b.board.id || a.components.length !== b.components.length) return false;
	const ids = new Set(a.components.map(c => c.id));
	return b.components.every(c => ids.has(c.id));
};

const waitForAtom = (store: Store, done: (workflow: Workflow) => boolean, timeoutMs = 3000) =>
	new Promise<void>(resolve => {
		const check = () => {
			const current = store.get(WorkflowAtom);
			if (current && done(current)) finish();
		};
		const finish = () => {
			clearTimeout(timer);
			unsubscribe();
			resolve();
		};
		const timer = setTimeout(finish, timeoutMs);
		const unsubscribe = store.sub(WorkflowAtom, check);
		check();
	});
