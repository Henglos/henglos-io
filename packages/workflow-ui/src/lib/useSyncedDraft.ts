import { useCallback, useState } from "react";

/**
 * A field's local draft that follows its committed value.
 *
 * Fields keep a draft so typing doesn't commit on every keystroke — but a
 * plain `useState(value)` only reads `value` once, so when it changes from
 * outside (a collaborator's edit, an undo, a server-side op) the field kept
 * showing the stale draft. Here the draft is reset whenever `value` changes
 * by content; while only the user is typing, `value` stays put and the draft
 * is left alone.
 */
export function useSyncedDraft<V, D>(value: V, toDraft: (value: V) => D) {
	// By content: object values (pins, "any" values) can come back from the
	// doc as new instances without having changed.
	const key = JSON.stringify(value ?? null);
	const [state, setState] = useState(() => ({ key, draft: toDraft(value) }));

	let current = state;
	if (state.key !== key) {
		// Adjusting state during render when a prop changes — React re-runs
		// this render with it before committing, no extra paint.
		current = { key, draft: toDraft(value) };
		setState(current);
	}

	const setDraft = useCallback((draft: D) => setState(prev => ({ ...prev, draft })), []);

	return [current.draft, setDraft] as const;
}
