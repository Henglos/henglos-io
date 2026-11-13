import { Button, Text } from "@henglosio/ui";
import { Loader2, Square } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import type { PortStatusOut, TaskType } from "@henglosio/shared";
import { debugGet, debugStop, getPortStatus, releasePort, stopTask } from "@/shared/api";
import { WorkflowAtom } from "../../store/workflow.store";
import { DeviceSelectionAtom, DriverConnectionAtom } from "../../store/driver.store";
import { ActiveTaskIdAtom } from "../../store/logs.store";
import { DebugSessionAtom } from "../../store/debug.store";
import { useDebugger } from "../../hooks/useDebugger";

// How often the board is asked what it's running, while the page is visible.
const POLL_MS = 3000;

const LABELS: Record<string, string> = {
	execute: "Play",
	debug: "Debug",
	run: "Run ▶",
	record: "Record",
	flash: "Flash",
	compile: "Compile",
	repl: "REPL",
	fs: "Reading files",
};

const elapsed = (since: number) => {
	const seconds = Math.max(0, Math.round((Date.now() - since) / 1000));
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

/**
 * What the selected board is doing — idle, or which operation holds it and
 * for how long — and the studio picking it up as it is: a debug session on
 * this workflow opens debug mode where it stands, anything else on it shows
 * its log. Its Stop is that operation's own (debug's stop, the task's stop).
 * A task nothing tracks can still be stopped: that frees the board itself.
 */
export const BoardStatus = () => {

	const driver = useAtomValue(DriverConnectionAtom);
	const device = useAtomValue(DeviceSelectionAtom);
	const workflow = useAtomValue(WorkflowAtom);
	const [activeTaskId, setActiveTaskId] = useAtom(ActiveTaskIdAtom);
	const [debugSession, setDebugSession] = useAtom(DebugSessionAtom);
	const debug = useDebugger();

	const [status, setStatus] = useState<PortStatusOut | null>(null);
	const [stopping, setStopping] = useState(false);
	const [, setTick] = useState(0);
	// Tasks already picked up — once each, so choosing another log afterwards sticks.
	const attached = useRef(new Set<string>());

	const refresh = useCallback(async () => {
		if (!driver || !device) return setStatus(null);
		try {
			setStatus(await getPortStatus(driver.id, device.port));
		} catch {
			setStatus(null);
		}
	}, [driver, device]);

	useEffect(() => {
		void refresh();
		const timer = setInterval(() => {
			if (document.visibilityState === "visible") void refresh();
			setTick(tick => tick + 1);          // the elapsed time moves on
		}, POLL_MS);
		return () => clearInterval(timer);
	}, [refresh, activeTaskId]);

	const task = status?.tasks[0];
	const ours = !!task?.workflowId && task.workflowId === workflow?.id;

	// Pick up what this workflow has running on the board.
	useEffect(() => {
		if (!driver || !task || !ours || attached.current.has(task.taskId)) return;

		if (task.label === "debug") {
			if (debugSession?.state.sessionId === task.taskId) { attached.current.add(task.taskId); return; }
			void debugGet(driver.id, task.taskId).then(state => {
				// Mid-step (or still starting): picked up once it's paused, on a later poll.
				if (state.busy) return;
				attached.current.add(task.taskId);
				const { workflowId: _workflowId, entryId, busy: _busy, ...debugState } = state;
				setDebugSession({ driverId: driver.id, entryId, state: debugState, ranAt: new Date(), busy: false, error: null });
				setActiveTaskId(task.taskId);
				// Listening for a trigger: listen on from here.
				if (debugState.status === "listening") void debug.listen(task.taskId);
			}).catch(() => {});                  // not open yet / just ended: the next poll tells
			return;
		}

		attached.current.add(task.taskId);
		// The REPL and the file browser are panels of their own, not a log.
		if (task.hostingType === "repl" || task.hostingType === "fs") return;
		if (activeTaskId !== task.taskId) setActiveTaskId(task.taskId);
	}, [driver, task, ours, debugSession, activeTaskId, setActiveTaskId, setDebugSession]);

	if (!driver || !device || !status) return null;

	if (!task) {
		return (
			<div className="flex items-center gap-1.5 whitespace-nowrap" title={`${device.port} is free`}>
				<span className="size-1.5 rounded-full bg-fg-faint" />
				<Text variant="low" size="xs">Board idle</Text>
			</div>
		);
	}

	const tracked = !!task.workflowId;
	const label = LABELS[task.label ?? task.hostingType ?? ""] ?? (task.hostingType ?? `unknown (${task.type})`);

	const onStop = async () => {
		setStopping(true);
		try {
			if (!task.hostingType) await releasePort(driver.id, device.port);
			else if (task.label === "debug") {
				if (debugSession?.state.sessionId === task.taskId) setDebugSession(null);
				await debugStop(driver.id, task.taskId);
			}
			else await stopTask(driver.id, task.hostingType as TaskType, task.taskId);
		} catch {
			// Ended meanwhile — the next poll shows the board as it is.
		} finally {
			setStopping(false);
			void refresh();
		}
	};

	const title = !tracked
		? `${device.port}: a task no studio tracks any more — Stop frees the board`
		: `${device.port}: ${label}${ours ? "" : " on another workflow"}`;

	return (
		<div className="flex items-center gap-1.5 whitespace-nowrap" title={title}>
			<span className="size-1.5 rounded-full bg-warning animate-pulse" />
			<Text variant="dim" size="xs" className="tabular-nums">
				{label} · {elapsed(task.startedAt)}
			</Text>
			{tracked && !ours && (
				<Link href={`/studio/${task.workflowId}`} className="text-xs text-accent-fg hover:underline">
					open its workflow
				</Link>
			)}
			<Button.Root variant="ghost" onClick={onStop} disabled={stopping} title={`Stop the ${label}`}>
				<Button.Icon>
					{stopping ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
				</Button.Icon>
				<Button.Label>Stop</Button.Label>
			</Button.Root>
		</div>
	);

};
