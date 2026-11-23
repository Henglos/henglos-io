import { useState } from "react";
import { ResizeHandle, useResizable } from "../components/ResizeHandle/ResizeHandle.component";
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

// ─── layout ───────────────────────────────────────────────────────────────────

export const BottomBarLayout = () => {

	const [activePanel, setActivePanel] = useState<ActivePanel>(null);
	// Its height — dragged by its top edge, kept in this browser.
	const { size: panelHeight, setSize: setPanelHeight } = useResizable({ storageKey: "studio.bottomPanel.height", initial: DEFAULT_HEIGHT, min: MIN_HEIGHT, max: MAX_HEIGHT });

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

	const toggle = (panel: ActivePanel) =>
		setActivePanel(prev => (prev === panel ? null : panel));

	return (

		<aside className="w-full flex flex-col bg-chrome border-t border-line">

			{/* the panel's content — always mounted: the REPL keeps its session and
			    history while another tab (or none) is open. Its top edge resizes it
			    (dragging up grows it) — over the border, taking no room. */}
			<div
				style={{ height: panelHeight }}
				className={clsx("relative w-full border-b border-line shrink-0", !activePanel && "hidden")}
			>
				{activePanel && <ResizeHandle edge="top" size={panelHeight} onResize={(height, done) => setPanelHeight(height, done)} />}
				<div className="w-full h-full overflow-hidden">
				{activePanel === "logs" && <LogsPanel />}
				{activePanel === "inspector" && <InspectorPanel />}
				<div className={clsx("w-full h-full", activePanel !== "repl" && "hidden")}>
					<ReplPanel visible={activePanel === "repl"} />
				</div>
				<div className={clsx("w-full h-full", activePanel !== "files" && "hidden")}>
					<FilesPanel visible={activePanel === "files"} />
				</div>
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
