import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import type { IActionRuntime, IComponentRuntime, IConnectionRuntime } from "@henglosio/workflow";
import type { WorkflowPatch } from "@henglosio/shared";
import { updateWorkflow } from "@shared/api";
import { WorkflowAtom, WorkflowSavedCanvasAtom, WorkflowStatusAtom } from "../store/workflow.store";
import { WorkflowCollabAtom, WorkflowCollabSyncedAtom } from "../store/collab.store";
import { waitForCollabSync } from "./useWorkflowCollab";

type Canvas = { start: IActionRuntime; components: IComponentRuntime[]; connections: IConnectionRuntime[] };

function diffCanvas(prev: Canvas, curr: Canvas): WorkflowPatch[] {
	const patches: WorkflowPatch[] = [];

	// Start node position — it isn't inside any component, so it has its own path.
	if (curr.start.x !== prev.start.x) {
		patches.push({ op: "replace", path: "/start/x", value: curr.start.x ?? 0 });
	}
	if (curr.start.y !== prev.start.y) {
		patches.push({ op: "replace", path: "/start/y", value: curr.start.y ?? 0 });
	}

	// Position changes — replace only the x/y that moved, addressed by component+action ID
	for (const currComp of curr.components) {
		const prevComp = prev.components.find(c => c.id === currComp.id);
		if (!prevComp) continue;

		for (const currAction of currComp.actions) {
			const prevAction = prevComp.actions.find(a => a.id === currAction.id);
			if (!prevAction) continue;

			if (currAction.x !== prevAction.x) {
				patches.push({
					op: "replace",
					path: "/components/:comp/actions/:action/x",
					where: { comp: { id: { equal: currComp.id } }, action: { id: { equal: currAction.id } } },
					value: currAction.x ?? 0,
				});
			}
			if (currAction.y !== prevAction.y) {
				patches.push({
					op: "replace",
					path: "/components/:comp/actions/:action/y",
					where: { comp: { id: { equal: currComp.id } }, action: { id: { equal: currAction.id } } },
					value: currAction.y ?? 0,
				});
			}
		}
	}

	// Added connections
	const prevIds = new Set(prev.connections.map(c => c.id));
	for (const conn of curr.connections) {
		if (!prevIds.has(conn.id)) {
			patches.push({ op: "add:connection", path: "", connection: conn });
		}
	}

	// Removed connections
	const currIds = new Set(curr.connections.map(c => c.id));
	for (const conn of prev.connections) {
		if (!currIds.has(conn.id)) {
			patches.push({ op: "remove:connection", path: "", connectionId: conn.id });
		}
	}

	return patches;
}

export function useWorkflowAutoSave() {
	const [workflow] = useAtom(WorkflowAtom);
	const [savedCanvas, setSavedCanvas] = useAtom(WorkflowSavedCanvasAtom);
	const setStatus = useSetAtom(WorkflowStatusAtom);
	// Once the collab doc is synced it carries every change (useWorkflowCollab),
	// so this HTTP path only covers the moments before that / without it.
	const collab = useAtomValue(WorkflowCollabAtom);
	const collabSynced = useAtomValue(WorkflowCollabSyncedAtom);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	// Holds the in-flight save's promise (not just a boolean) so flush() below
	// can await whatever's already running instead of just skipping it — a
	// bare "isSaving" flag can only say no, it can't hand back something to wait on.
	const savePromiseRef = useRef<Promise<void> | null>(null);

	const doSave = useCallback((
		id: string,
		patches: WorkflowPatch[],
		snapshot: Canvas,
	): Promise<void> => {

		const run = (async () => {
			try {
				await updateWorkflow(id, { patch: patches });
				setSavedCanvas(snapshot);
				setStatus({ synchronized: true, saved: true });
			} catch {
				setStatus(prev => prev ? { ...prev, saved: false } : { synchronized: false, saved: false });
			}
		})();

		savePromiseRef.current = run;
		run.finally(() => { if (savePromiseRef.current === run) savePromiseRef.current = null; });

		return run;

	}, [setSavedCanvas, setStatus]);

	useEffect(() => {
		if (collabSynced) return;
		if (!workflow || !savedCanvas) return;
		// A save already in flight will land on savedCanvas and re-trigger this
		// effect with a fresh diff — scheduling another one now would just have
		// doSave silently clobber/duplicate it.
		if (savePromiseRef.current) return;

		const curr = { start: workflow.data.start, components: workflow.data.components, connections: workflow.data.connections };
		const patches = diffCanvas(savedCanvas, curr);
		if (patches.length === 0) return;

		setStatus(prev => ({ synchronized: prev?.synchronized ?? true, saved: false }));

		clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			doSave(workflow.id, patches, curr);
		}, 500);

		return () => clearTimeout(timerRef.current);
	}, [workflow, savedCanvas, doSave, setStatus, collabSynced]);

	// Forces any pending debounced position/connection save to run right now,
	// and waits for it (or for whatever save is already mid-flight) to land.
	// Anything that's about to read this workflow back from the backend —
	// Record/Compile/Flash — must await this first: without it, an edit made
	// just before clicking one of those can still be sitting in the 500ms
	// debounce window, so the backend serves (and burns/compiles) the
	// previous version instead of what's on screen.
	const flush = useCallback(async (): Promise<void> => {

		clearTimeout(timerRef.current);

		if (collab && collabSynced) {
			await waitForCollabSync(collab.provider);
			return;
		}

		if (savePromiseRef.current) {
			await savePromiseRef.current;
			return;
		}

		if (!workflow || !savedCanvas) return;

		const curr = { start: workflow.data.start, components: workflow.data.components, connections: workflow.data.connections };
		const patches = diffCanvas(savedCanvas, curr);
		if (patches.length === 0) return;

		await doSave(workflow.id, patches, curr);

	}, [workflow, savedCanvas, doSave, collab, collabSynced]);

	return { flush };
}
