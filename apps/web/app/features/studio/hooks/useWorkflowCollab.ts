import { useEffect, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import * as Y from "yjs";
import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { readWorkflowDoc, reconcileWorkflowDoc, workflowDocRoot, type IWorkflowRuntime } from "@henglosio/workflow";
import { getCookie } from "@shared/lib/cookies";
import { getAccount } from "@shared/api/account";
import { WorkflowAtom, WorkflowSavedCanvasAtom, WorkflowStatusAtom } from "../store/workflow.store";
import {
	CollabPeersAtom,
	CollabRemoteDragsAtom,
	WorkflowCollabAtom,
	WorkflowCollabSyncedAtom,
	WorkflowHistoryAtom,
	type CollabPeer,
	type CollabPresence,
} from "../store/collab.store";

// Tags transactions this tab wrote — its own echo isn't read back into state,
// and it's the only origin the undo manager tracks (so undo never reverts
// someone else's edit, nor a server-side op like add:component).
const LOCAL_ORIGIN = Symbol("studio-local");

// Edits closer together than this undo as one step (e.g. a value typed and its blur).
const UNDO_CAPTURE_MS = 400;

// Theme tokens, so cursor colors follow light/dark.
const PEER_COLORS = ["var(--cat-sensor)", "var(--cat-actuator)", "var(--cat-logic)", "var(--cat-comm)", "var(--info)", "var(--warning)"];
const colorFor = (seed: number) => PEER_COLORS[Math.abs(seed) % PEER_COLORS.length]!;

const collabUrl = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/io/collab`;

/**
 * Opens the workflow's collaborative Y.Doc on /io/collab and keeps it and
 * WorkflowAtom in step, both ways:
 *
 *  - remote → atom: any change that didn't come from this tab (another
 *    collaborator, or a server-side HTTP op merged in by the hosting) is read
 *    back into WorkflowAtom.
 *  - atom → doc: every local change to `workflow.data` is reconciled into the
 *    doc right away, so the two never drift and there's nothing to debounce.
 */
export function useWorkflowCollab(workflowId: string | undefined, ready: boolean) {
	const [workflow, setWorkflow] = useAtom(WorkflowAtom);
	const setSavedCanvas = useSetAtom(WorkflowSavedCanvasAtom);
	const setStatus = useSetAtom(WorkflowStatusAtom);
	const [collab, setCollab] = useAtom(WorkflowCollabAtom);
	const [synced, setSynced] = useAtom(WorkflowCollabSyncedAtom);
	const setHistory = useSetAtom(WorkflowHistoryAtom);
	const setPeers = useSetAtom(CollabPeersAtom);
	const setRemoteDrags = useSetAtom(CollabRemoteDragsAtom);

	const { data: account } = useQuery({ queryKey: ["account"], queryFn: getAccount, staleTime: Infinity });

	// Last data read from (or written to) the doc — lets the atom → doc effect
	// skip the re-render caused by its own remote → atom write.
	const lastDocData = useRef<IWorkflowRuntime | null>(null);

	useEffect(() => {
		if (!workflowId || !ready) return;

		const doc = new Y.Doc();

		const pull = () => {
			const data = readWorkflowDoc(doc);
			lastDocData.current = data;
			setWorkflow(prev => (prev ? { ...prev, data } : prev));
			setSavedCanvas({ start: data.start, components: data.components, connections: data.connections });
		};

		const onUpdate = (_update: Uint8Array, origin: unknown) => {
			if (origin === LOCAL_ORIGIN) return;
			pull();
		};

		const provider = new HocuspocusProvider({
			url: collabUrl(),
			name: `workflow:${workflowId}`,
			document: doc,
			token: () => getCookie("accessToken") ?? "",
			flushDelay: 100,
			onSynced: ({ state }) => {
				if (!state) return;
				pull();
				setSynced(true);
			},
			onStatus: ({ status }) => {
				setStatus(prev => ({ synchronized: status === WebSocketStatus.Connected, saved: prev?.saved ?? true }));
			},
			onUnsyncedChanges: ({ number }) => {
				setStatus(prev => ({ synchronized: prev?.synchronized ?? true, saved: number === 0 }));
			},
			onAuthenticationFailed: ({ reason }) => {
				console.warn(`[collab] authentication failed: ${reason}`);
			},
		});

		const undoManager = new Y.UndoManager(workflowDocRoot(doc), {
			trackedOrigins: new Set([LOCAL_ORIGIN]),
			captureTimeout: UNDO_CAPTURE_MS,
		});
		const syncHistory = () => setHistory({ canUndo: undoManager.canUndo(), canRedo: undoManager.canRedo() });
		undoManager.on("stack-item-added", syncHistory);
		undoManager.on("stack-item-popped", syncHistory);
		undoManager.on("stack-cleared", syncHistory);

		const awareness = provider.awareness;
		let lastDrags = "{}";
		const onAwarenessChange = () => {
			if (!awareness) return;
			const peers: CollabPeer[] = [];
			const drags: CollabPresence["drag"] = {};
			awareness.getStates().forEach((state, clientId) => {
				const presence = state as Partial<CollabPresence>;
				if (clientId === doc.clientID || !presence.user) return;
				peers.push({ clientId, user: presence.user, cursor: presence.cursor ?? null, drag: presence.drag ?? null });
				Object.assign(drags, presence.drag);
			});
			setPeers(peers);

			// Only touch the drags atom when they actually changed — cursor-only
			// updates arrive ~20×/s and must not re-render the canvas nodes.
			const serialized = JSON.stringify(drags);
			if (serialized !== lastDrags) {
				lastDrags = serialized;
				setRemoteDrags(drags);
			}
		};
		awareness?.on("change", onAwarenessChange);

		doc.on("update", onUpdate);
		setCollab({ doc, provider, undoManager });

		return () => {
			awareness?.off("change", onAwarenessChange);
			undoManager.destroy();
			doc.off("update", onUpdate);
			provider.destroy();
			doc.destroy();
			lastDocData.current = null;
			setCollab(null);
			setSynced(false);
			setHistory({ canUndo: false, canRedo: false });
			setPeers([]);
			setRemoteDrags({});
		};
	}, [workflowId, ready, setWorkflow, setSavedCanvas, setStatus, setCollab, setSynced, setHistory, setPeers, setRemoteDrags]);

	// Who this tab is, for everyone else's cursor labels.
	useEffect(() => {
		if (!collab || !account) return;
		collab.provider.awareness?.setLocalStateField("user", {
			id: account.id,
			name: account.username,
			color: colorFor(collab.doc.clientID),
		} satisfies CollabPresence["user"]);
	}, [collab, account]);

	// atom → doc
	useEffect(() => {
		if (!collab || !synced || !workflow) return;
		if (workflow.data === lastDocData.current) return;

		reconcileWorkflowDoc(collab.doc, workflow.data, LOCAL_ORIGIN);
		lastDocData.current = workflow.data;
		setSavedCanvas({ start: workflow.data.start, components: workflow.data.components, connections: workflow.data.connections });
	}, [collab, synced, workflow, setSavedCanvas]);
}

/**
 * Resolves once every local change has been acknowledged by the server, or
 * after `timeoutMs`. The hosting persists the live doc before compile/flash/
 * record/execute read it, so acknowledged is enough there.
 */
export function waitForCollabSync(provider: HocuspocusProvider, timeoutMs = 5000): Promise<void> {
	provider.flushPendingUpdates();
	if (!provider.hasUnsyncedChanges) return Promise.resolve();

	return new Promise(resolve => {
		const done = () => {
			clearTimeout(timer);
			provider.off("unsyncedChanges", onChange);
			resolve();
		};
		const onChange = ({ number }: { number: number }) => {
			if (number === 0) done();
		};
		const timer = setTimeout(done, timeoutMs);
		provider.on("unsyncedChanges", onChange);
	});
}
