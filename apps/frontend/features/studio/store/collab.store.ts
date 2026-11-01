import { atom } from "jotai";
import type * as Y from "yjs";
import type { HocuspocusProvider } from "@hocuspocus/provider";

export type WorkflowCollab = {
	doc: Y.Doc;
	provider: HocuspocusProvider;
	undoManager: Y.UndoManager;
};

// The open collaborative doc for the workflow in the studio (see useWorkflowCollab).
export const WorkflowCollabAtom = atom<WorkflowCollab | null>(null);

// True once the doc finished its first sync with the server. Until then the
// studio keeps using the HTTP paths (autosave / mutate responses) as before.
export const WorkflowCollabSyncedAtom = atom(false);

export const WorkflowHistoryAtom = atom({ canUndo: false, canRedo: false });

// ─── Presence ────────────────────────────────────────────────────────────────

export type CollabUser = { id: string; name: string; color: string };

export type FlowPoint = { x: number; y: number };

/** What each client publishes through Yjs awareness. Positions are in flow coordinates. */
export type CollabPresence = {
	user: CollabUser;
	cursor: FlowPoint | null;
	/**
	 * Nodes this client is dragging right now, by node id. Ephemeral: the final
	 * position is written to the doc on drag stop — streaming every frame
	 * through the doc would bloat its history and the undo stack.
	 */
	drag: Record<string, FlowPoint> | null;
};

export type CollabPeer = CollabPresence & { clientId: number };

/** Everyone else on this workflow (other people, or this user's other tabs). */
export const CollabPeersAtom = atom<CollabPeer[]>([]);

/**
 * Live positions of nodes other clients are dragging, merged by node id.
 * Kept apart from CollabPeersAtom so cursor moves don't rebuild the canvas nodes.
 */
export const CollabRemoteDragsAtom = atom<Record<string, FlowPoint>>({});
