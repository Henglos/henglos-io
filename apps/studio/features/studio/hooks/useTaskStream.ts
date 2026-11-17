import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import type { TaskEvent } from "@henglosio/shared";
import { getAppSocket, subscribeToTask } from "@shared/lib/socket";
import { ActiveTaskAtom, ActiveTaskIdAtom, ActiveTaskSinceAtom, TaskEventsAtom } from "../store/logs.store";

/**
 * Follows the active task's event stream: folds `task:event`s into the store in
 * `seq` order, tracks status, and stops once the task reaches a terminal state.
 * Re-subscription on socket reconnect is handled inside `subscribeToTask`.
 */
export const useTaskStream = () => {

	const taskId       = useAtomValue(ActiveTaskIdAtom);
	const setEvents     = useSetAtom(TaskEventsAtom);
	const setActiveTask = useSetAtom(ActiveTaskAtom);
	const setSince      = useSetAtom(ActiveTaskSinceAtom);

	// Keep the socket connected eagerly so hosting has our socket registered.
	useEffect(() => { getAppSocket(); }, []);

	useEffect(() => {

		if (!taskId) return;

		setEvents([]);
		setActiveTask(null);
		setSince(Date.now());

		const onEvent = (event: TaskEvent) => {

			if (event.kind !== "gap") {
				setEvents(prev => {
					// On socket reconnect the stream replays from the backlog, so
					// the same `seq` can arrive more than once — dedupe or the
					// Logs panel renders duplicate React keys.
					const existing = prev.findIndex(e => e.seq === event.seq);
					const next = existing === -1
						? [...prev, event]
						: prev.map((e, i) => (i === existing ? event : e));
					next.sort((a, b) => a.seq - b.seq);
					return next;
				});
			}

			if (event.kind === "status") {
				setActiveTask(prev => ({ id: taskId, type: prev?.type ?? "compile", status: event.status }));
			}
			if (event.kind === "result") {
				setActiveTask(prev => prev && { ...prev, status: event.ok ? "succeeded" : "failed" });
			}
		};

		const unsubscribe = subscribeToTask(taskId, onEvent);
		return unsubscribe;

	}, [taskId, setEvents, setActiveTask, setSince]);
};
