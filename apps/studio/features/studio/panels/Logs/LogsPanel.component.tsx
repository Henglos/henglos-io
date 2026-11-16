import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TaskEvent } from "@henglosio/shared";
import { Button, Text } from "@henglosio/ui";
import { stopTask } from "@shared/api";
import { ActiveTaskAtom, ActiveTaskIdAtom, TaskEventsAtom, isTerminalStatus } from "../../store/logs.store";
import { DriverConnectionAtom } from "../../store/driver.store";

type Row =
	| { _id: string; kind: "log"; stream: "stdout" | "stderr" | "info"; text: string }
	| { _id: string; kind: "note"; tone: "info" | "danger"; text: string };

// A task's phases as the log shows them — the board's firmware gets its own
// "prepare" (setting up toolchains, once) apart from the build and the flash.
const PHASE_LABELS: Record<string, string> = {
	prepare: "Preparing the environment",
	build: "Building",
	flash: "Flashing",
	firmware: "Writing the firmware",
	check: "Checking the board",
	upload: "Uploading",
	install: "Installing",
};

function toRows(events: TaskEvent[]): Row[] {
	const rows: Row[] = [];
	for (const ev of events) {
		switch (ev.kind) {
			case "log":
				rows.push({ _id: `e${ev.seq}`, kind: "log", stream: ev.stream, text: ev.line });
				break;
			case "progress":
				rows.push({ _id: `e${ev.seq}`, kind: "note", tone: "info", text: `— ${PHASE_LABELS[ev.phase] ?? ev.phase}${ev.pct != null ? ` ${ev.pct}%` : ""}` });
				break;
			case "status":
				rows.push({ _id: `e${ev.seq}`, kind: "note", tone: "info", text: `— ${ev.status}` });
				break;
			case "result":
				rows.push({
					_id: `e${ev.seq}`,
					kind: "note",
					tone: ev.ok ? "info" : "danger",
					text: ev.ok ? "— done" : `— ${ev.error ?? "failed"}`,
				});
				break;
			case "gap":
				rows.push({ _id: `gap${ev.dropped}`, kind: "note", tone: "info", text: `… ${ev.dropped} earlier lines not shown` });
				break;
		}
	}
	return rows;
}

const RowView: React.FC<{ row: Row }> = ({ row }) => {
	if (row.kind === "note") {
		return (
			<div className="font-mono text-xs py-0.5 px-4">
				<Text variant="dim" className={row.tone === "danger" ? "text-danger" : ""}>{row.text}</Text>
			</div>
		);
	}
	const isErr = row.stream === "stderr";
	return (
		<div className="flex gap-4 items-baseline font-mono text-xs py-0.5 px-4 hover:bg-hover">
			<Text variant="dim" className={isErr ? "text-danger" : ""}>{isErr ? "ERR" : row.stream === "info" ? "···" : "OUT"}</Text>
			<Text variant="high" className={`break-all whitespace-pre-wrap${isErr ? " text-danger" : ""}`}>{row.text}</Text>
		</div>
	);
};

export const LogsPanel = () => {

	const events   = useAtomValue(TaskEventsAtom);
	const taskId   = useAtomValue(ActiveTaskIdAtom);
	const active   = useAtomValue(ActiveTaskAtom);
	const driver   = useAtomValue(DriverConnectionAtom);

	const [stopping, setStopping] = useState(false);

	const bottomRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const pinnedRef = useRef(true);

	const rows = useMemo(() => toRows(events), [events]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const onScroll = () => {
			pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	useEffect(() => {
		if (pinnedRef.current) bottomRef.current?.scrollIntoView({ behavior: "instant" });
	}, [rows]);

	useEffect(() => { setStopping(false); }, [taskId]);

	const running = active ? !isTerminalStatus(active.status) : false;

	const onStop = async () => {
		if (!driver || !taskId || !active) return;
		setStopping(true);
		try {
			await stopTask(driver.id, active.type, taskId);
		} catch {
			setStopping(false);
		}
	};

	return (
		<div className="w-full h-full flex flex-col overflow-hidden">

			<div className="flex items-center justify-between px-4 py-2 shrink-0">
				<div className="flex items-center gap-2">
					<Text variant="dim" size="md">Logs</Text>
					{active && <Text variant="dim" size="md">{active.type} · {active.status}</Text>}
				</div>
				{running && (
					<Button.Root variant="ghost" disabled={stopping} onClick={onStop}>
						<Button.Label>{stopping ? "Stopping…" : "Stop"}</Button.Label>
					</Button.Root>
				)}
			</div>

			<div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
				{rows.length === 0 ? (
					<div className="flex items-center justify-center h-full">
						<Text variant="low" size="md">
							No logs yet. Run a compile, flash or record to start streaming.
						</Text>
					</div>
				) : (
					<>
						{rows.map(row => <RowView key={row._id} row={row} />)}
						<div ref={bottomRef} />
					</>
				)}
			</div>

		</div>
	);

};
