import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { TaskEvent } from "@henglosio/shared";
import { Button, Progress, Text } from "@henglosio/ui";
import { ActiveTaskIdAtom, ActiveTaskSinceAtom, TaskEventsAtom } from "../../store/logs.store";
import { DebugSessionAtom } from "../../store/debug.store";
import { DriverSyncAtom, type DriverSync } from "../../store/activity.store";
import { phaseLabel } from "../../lib/taskPhases";
import { useDriverSync } from "../../hooks/useDriverSync";
import { useStopActiveTask } from "../../hooks/useStopActiveTask";

/** One thing under way (or just ended), as a card shows it. */
type Activity = {
	key: string;
	title: string;
	detail?: string;
	state: "running" | "done" | "failed";
	/** How far, when it's known (0–100); the bar slides otherwise. */
	pct?: number;
	/** When it started here, for the elapsed time. */
	since?: number;
	/** The active task's — it can be cancelled from its card. */
	task?: boolean;
};

// How long an ended one stays: long enough to read, a failure longer.
const DONE_MS = 3_000;
const FAILED_MS = 10_000;
// A sync the driver never answers (an older driver): given up on.
const SYNC_STALE_MS = 3 * 60_000;

const elapsed = (since: number, now: number) => {
	const seconds = Math.max(0, Math.round((now - since) / 1000));
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

// The active task, from its events: shown while it goes through phases
// (compile, flash, a session's install…), not while a session just runs — a
// Play or a Run whose components are installed has nothing to wait for.
function taskActivity(taskId: string | null, events: TaskEvent[], since: number | undefined): Activity | null {
	if (!taskId) return null;
	const phases = events.filter((event): event is Extract<TaskEvent, { kind: "progress" }> => event.kind === "progress");
	if (phases.length === 0) return null;

	const last = phases[phases.length - 1]!;
	const onlyInstall = phases.every(event => event.phase === "install");
	const result = events.find((event): event is Extract<TaskEvent, { kind: "result" }> => event.kind === "result");
	const cancelled = events.some(event => event.kind === "status" && (event.status === "cancelled" || event.status === "stopping"));
	const key = `task:${taskId}`;

	if (cancelled) return null;
	if (result) {
		if (!result.ok) return { key, title: `${phaseLabel(last.phase)} failed`, detail: result.error, state: "failed" };
		// A session that installed and ran to its end: nothing to tell.
		return onlyInstall ? null : { key, title: "Done", state: "done" };
	}
	// Installed: the session runs from here on.
	if (onlyInstall && last.pct === 100) return null;

	return {
		key,
		title: phaseLabel(last.phase),
		state: "running",
		task: true,
		...(last.pct != null ? { pct: last.pct } : {}),
		...(last.phase === "prepare" ? { detail: "The first build for this board fetches its toolchain — it takes a while, once." } : {}),
		...(since != null ? { since } : {}),
	};
}

function syncActivity(sync: DriverSync | null, now: number): Activity | null {
	if (!sync) return null;
	const key = `sync:${sync.driverId}:${sync.at}`;
	switch (sync.state) {
		case "syncing":
			return now - sync.at > SYNC_STALE_MS ? null
				: { key, title: "Syncing workflows", detail: "Installing the packages your workflows use on the driver.", state: "running", since: sync.at };
		case "synced":
			return { key, title: "Workflows synced", state: "done" };
		case "failed":
			return { key, title: "Couldn't sync the workflows", ...(sync.error ? { detail: sync.error } : {}), state: "failed" };
	}
}

type Cancel = { onCancel: () => void; cancelling: boolean };

const ActivityCard: React.FC<{ activity: Activity; now: number; onDismiss: () => void; cancel?: Cancel }> = ({ activity, now, onDismiss, cancel }) => (
	<div className="pointer-events-auto w-72 flex flex-col gap-2 bg-overlay border border-line rounded-lg p-3 shadow-lg">
		<div className="flex items-center gap-2">
			{activity.state === "running" && <Loader2 size={14} className="animate-spin text-fg-muted shrink-0" />}
			{activity.state === "done" && <Check size={14} className="text-success shrink-0" />}
			{activity.state === "failed" && <X size={14} className="text-danger shrink-0" />}
			<Text variant="high" size="sm" className="flex-1 truncate">{activity.title}</Text>
			{activity.since != null && activity.state === "running" && (
				<Text variant="dim" size="xs" className="tabular-nums">{elapsed(activity.since, now)}</Text>
			)}
			{activity.state === "failed" && (
				<Button.Root variant="ghost" onClick={onDismiss} title="Dismiss">
					<Button.Icon><X size={12} /></Button.Icon>
				</Button.Root>
			)}
		</div>
		{activity.state === "running" && (
			activity.pct != null && activity.pct > 0
				? <Progress.Root value={activity.pct} size="sm" />
				: <Progress.Root indeterminate size="sm" />
		)}
		{activity.detail && (
			<Text variant="dim" size="xs" className={activity.state === "failed" ? "text-danger break-words" : "break-words"}>
				{activity.detail}
			</Text>
		)}
		{cancel && activity.state === "running" && (
			<div className="flex justify-end">
				<Button.Root variant="ghost" disabled={cancel.cancelling} onClick={cancel.onCancel}>
					<Button.Label>{cancel.cancelling ? "Cancelling…" : "Cancel"}</Button.Label>
				</Button.Root>
			</div>
		)}
	</div>
);

/**
 * What's under way, in cards over the canvas's corner: the driver syncing the
 * workflows when it connects, and the active task's phases — preparing the
 * environment, building, flashing, installing — with a bar that fills when
 * how far is known and slides when it isn't. Debugging gets none: it has its
 * own view. An ended one stays a moment (a failure, until read), then goes.
 */
export const ActivityBox = () => {

	useDriverSync();

	const taskId = useAtomValue(ActiveTaskIdAtom);
	const events = useAtomValue(TaskEventsAtom);
	const debugSession = useAtomValue(DebugSessionAtom);
	const sync = useAtomValue(DriverSyncAtom);

	const since = useAtomValue(ActiveTaskSinceAtom);
	const { canStop, stopping, stop } = useStopActiveTask();
	const [dismissed, setDismissed] = useState<Set<string>>(new Set());
	// The clock the elapsed times and the stale sync are read against — moved on each second while one runs.
	const [now, setNow] = useState(() => Date.now());

	const debugging = !!taskId && debugSession?.state.sessionId === taskId;

	const activities = useMemo(() => [
		syncActivity(sync, now),
		debugging ? null : taskActivity(taskId, events, since ?? undefined),
	].filter((activity): activity is Activity => !!activity && !dismissed.has(activity.key)),
	[sync, now, taskId, events, since, debugging, dismissed]);

	const dismiss = (key: string) => setDismissed(prev => new Set(prev).add(key));

	// Each second while one runs: its elapsed time moves on.
	const running = activities.some(activity => activity.state === "running");
	useEffect(() => {
		if (!running) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [running]);

	// The ended ones go after a while.
	const endedKeys = activities.filter(activity => activity.state !== "running").map(activity => `${activity.key}|${activity.state}`).join(",");
	useEffect(() => {
		const timers = activities
			.filter(activity => activity.state !== "running")
			.map(activity => setTimeout(() => dismiss(activity.key), activity.state === "failed" ? FAILED_MS : DONE_MS));
		return () => timers.forEach(clearTimeout);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- once per ended activity
	}, [endedKeys]);

	if (activities.length === 0) return null;

	return (
		<div className="pointer-events-none absolute right-0 bottom-0 m-4 z-10 flex flex-col gap-2 items-end">
			{activities.map(activity => (
				<ActivityCard
					key={activity.key}
					activity={activity}
					now={now}
					onDismiss={() => dismiss(activity.key)}
					{...(activity.task && canStop ? { cancel: { onCancel: stop, cancelling: stopping } } : {})}
				/>
			))}
		</div>
	);

};
