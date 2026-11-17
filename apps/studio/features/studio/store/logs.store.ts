import { atom } from "jotai";
import type { TaskEvent, TaskRecord, TaskStatus } from "@henglosio/shared";

// The task the Logs panel is currently following.
export const ActiveTaskIdAtom = atom<string | null>(null);

// When the studio started following it — its events carry no time.
export const ActiveTaskSinceAtom = atom<number | null>(null);

// Events for the active task, kept in `seq` order.
export const TaskEventsAtom = atom<TaskEvent[]>([]);

// Derived-ish: last known status/record of the active task (updated by useTaskStream).
export const ActiveTaskAtom = atom<Pick<TaskRecord, "id" | "type" | "status"> | null>(null);

export const isTerminalStatus = (s: TaskStatus): boolean =>
	s === "succeeded" || s === "failed" || s === "cancelled";
