import { useCallback, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { LogsButton } from "../panels/Logs/LogsButton.component";
import { LogsPanel } from "../panels/Logs/LogsPanel.component";
import { ReplButton } from "../panels/Repl/ReplButton.component";
import { ReplPanel } from "../panels/Repl/ReplPanel.component";
import { FilesButton } from "../panels/Files/FilesButton.component";
import { FilesPanel } from "../panels/Files/FilesPanel.component";
import clsx from "clsx";
import { ActiveTaskIdAtom } from "../store/logs.store";
import { useSelectedAction } from "../hooks/useSelectedAction";
import { NODE_LAYOUT } from "../lib/nodeLayout";
import { InspectorButton } from "../panels/Inspector/InspectorButton.component";
import { InspectorPanel } from "../features/action-inspector/InspectorPanel.feature";

// ─── tipos ────────────────────────────────────────────────────────────────────

type ActivePanel = "inspector" | "logs" | "repl" | "files" | null;

// ─── constantes ───────────────────────────────────────────────────────────────

const DEFAULT_HEIGHT = 240;
const MIN_HEIGHT     = 80;
const MAX_HEIGHT     = 600;
// The inspector's columns need room: opening it raises the panel to this.
const INSPECTOR_HEIGHT = 320;

// ─── resize hook ──────────────────────────────────────────────────────────────

function useResizeHandle(panelHeight: number, setPanelHeight: (h: number) => void) {

	const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

	const onMouseDown = useCallback((e: React.MouseEvent) => {

		e.preventDefault();
		dragRef.current = { startY: e.clientY, startHeight: panelHeight };

		const onMove = (e: MouseEvent) => {
			if (!dragRef.current) return;
			// dragging up (smaller Y) → a bigger panel
			const next = dragRef.current.startHeight + (dragRef.current.startY - e.clientY);
			setPanelHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, next)));
		};

		const onUp = () => {
			dragRef.current = null;
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};

		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);

	}, [panelHeight, setPanelHeight]);

	return onMouseDown;

}

// ─── layout ───────────────────────────────────────────────────────────────────

export const BottomBarLayout = () => {

	const [activePanel, setActivePanel] = useState<ActivePanel>(null);
	const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);

	// A task's log comes up when it starts — unless the inspector is open:
	// a ▶ from it shows its result right there.
	const activeTaskId = useAtomValue(ActiveTaskIdAtom);
	const [seenTaskId, setSeenTaskId] = useState<string | null>(null);
	if (activeTaskId !== seenTaskId) {
		setSeenTaskId(activeTaskId);
		if (activeTaskId && activePanel !== "inspector") setActivePanel("logs");
	}

	// NODE_LAYOUT "panel": selecting an action opens the inspector (tall
	// enough for its columns); deselecting goes back to what was open before.
	const { component, action } = useSelectedAction();
	const inspected = NODE_LAYOUT === "panel" && action && component ? action.id : null;
	const [seenInspected, setSeenInspected] = useState(inspected);
	const [beforeInspector, setBeforeInspector] = useState<ActivePanel>(null);
	if (inspected !== seenInspected) {
		setSeenInspected(inspected);
		if (inspected && activePanel !== "inspector") {
			setBeforeInspector(activePanel);
			setActivePanel("inspector");
			if (panelHeight < INSPECTOR_HEIGHT) setPanelHeight(INSPECTOR_HEIGHT);
		} else if (!inspected && activePanel === "inspector") {
			setActivePanel(beforeInspector);
		}
	}

	const onResizeStart = useResizeHandle(panelHeight, setPanelHeight);

	const toggle = (panel: ActivePanel) =>
		setActivePanel(prev => (prev === panel ? null : panel));

	return (

		<aside className="w-full flex flex-col bg-chrome border-t border-line">

			{/* drag handle — dragging up expands it, down shrinks it */}
			{activePanel && (
				<div
					onMouseDown={onResizeStart}
					className="h-2 w-full shrink-0 cursor-ns-resize group"
				>
					<div className="h-full w-full bg-transparent group-hover:bg-line transition-colors" />
				</div>
			)}

			{/* the panel's content — always mounted: the REPL keeps its session and
			    history while another tab (or none) is open */}
			<div
				style={{ height: panelHeight }}
				className={clsx("w-full overflow-hidden border-b border-line shrink-0", !activePanel && "hidden")}
			>
				{activePanel === "logs" && <LogsPanel />}
				{activePanel === "inspector" && <InspectorPanel />}
				<div className={clsx("w-full h-full", activePanel !== "repl" && "hidden")}>
					<ReplPanel visible={activePanel === "repl"} />
				</div>
				<div className={clsx("w-full h-full", activePanel !== "files" && "hidden")}>
					<FilesPanel visible={activePanel === "files"} />
				</div>
			</div>

			{/* ── button strip — always visible ── */}
			<div className="flex items-center w-full h-6">

				{NODE_LAYOUT === "panel" && (
					<InspectorButton
						active={activePanel === "inspector"}
						onClick={() => toggle("inspector")}
					/>
				)}

				<LogsButton
					active={activePanel === "logs"}
					onClick={() => toggle("logs")}
				/>

				<ReplButton
					active={activePanel === "repl"}
					onClick={() => toggle("repl")}
				/>

				<FilesButton
					active={activePanel === "files"}
					onClick={() => toggle("files")}
				/>

			</div>

		</aside>

	);

}
