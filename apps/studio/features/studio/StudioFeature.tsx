"use client";

import { useParams } from "next/navigation";
import { WorkspaceLayout } from "./layouts/Workspace.layout";
import { useQuery } from "@tanstack/react-query";
import { getWorkflow } from "@shared/api";
import { useSetAtom } from "jotai";
import { WorkflowAtom, WorkflowSavedCanvasAtom } from "./store/workflow.store";
import { FloatToolboxLayout } from "./layouts/FloatToolbox";
import { useEffect } from "react";
import { emitToast } from "@henglosio/ui";
import { BottomBarLayout } from "./layouts/BottomBar.layout";
import { ActivityBar } from "@/shared/components/ActiveBar.component";
import { TopBarLayout } from "./layouts/TopBar.layout";
import { useWorkflowAutoSave } from "./hooks/useWorkflowAutoSave";
import { useWorkflowCollab } from "./hooks/useWorkflowCollab";
import { useWorkflowHistoryShortcuts } from "./hooks/useWorkflowHistory";
import { useTaskStream } from "./hooks/useTaskStream";
import { usePlatformSpec } from "./hooks/usePlatformSpec";
import { PrimarySidebarLayout } from "./layouts/PrimarySidebar.layout";
import { SecondarySidebarLayout } from "./layouts/SecondarySidebar.layout";
import { BindDragProvider } from "./lib/bindDrag";
import { ActivityBox } from "./features/activity/ActivityBox.component";

export const StudioFeature = () => {

	const params = useParams<{ id: string }>();
	const setWorkflow = useSetAtom(WorkflowAtom);
	const setSavedCanvas = useSetAtom(WorkflowSavedCanvasAtom);

	const { data: workflow } = useQuery({
		queryKey: ["workflow", params.id],
		queryFn: () => getWorkflow(params.id!),
		enabled: !!params.id,
	});

	useEffect(() => {
		if (!workflow) return;
		setWorkflow(workflow);
		setSavedCanvas({ start: workflow.data.start, components: workflow.data.components, connections: workflow.data.connections });
	}, [workflow]);

	// Its board's version was removed from the library with no other to move it
	// to: it keeps the last pins it had, but won't build until a board is picked.
	useEffect(() => {
		if (workflow?.boardMissing) {
			emitToast("warning", "This workflow has no board", {
				detail: "Its board's version was removed from your library. Pick a board with Edit, on the hub, before compiling.",
				duration: 0,
			});
		}
	}, [workflow?.id, workflow?.boardMissing]);

	useWorkflowCollab(params.id, !!workflow);
	useWorkflowHistoryShortcuts();
	useWorkflowAutoSave();
	useTaskStream();
	usePlatformSpec();

	return (

		// Drag-to-bind spans the sidebar (variables) and the canvas (outputs, configs).
		<BindDragProvider>

		<main className="flex w-full h-full bg-canvas overflow-hidden">

			<ActivityBar />

			<div className="flex flex-col w-full h-full min-w-0">

				<div className="flex h-full">

					<PrimarySidebarLayout />

					{/* min-w-0: the center column never grows to fit its content (a
					    terminal, a long log line) — it would squeeze the sidebars off. */}
					<div className="flex flex-1 flex-col w-full min-h-0 min-w-0">

						<TopBarLayout />

						<div className="relative flex-1 w-full h-full">

							<WorkspaceLayout />
							<FloatToolboxLayout />
							<ActivityBox />

						</div>

						<BottomBarLayout />
						
					</div>

					<SecondarySidebarLayout />

				</div>

			</div>

		</main>

		</BindDragProvider>

	);

}
