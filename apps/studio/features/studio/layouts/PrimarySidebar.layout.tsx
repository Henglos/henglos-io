import { Sidebar } from "@/shared/components/Sidebar.component";
import { ExplorerTree } from "../features/explorer-tree/ExplorerTree.feature";
import { ComponentsTree } from "../features/components-tree/ComponentsTree.feature";
import { VariablesTree } from "../features/variables-tree/VariablesTree.feature";
import { WorkflowHeader } from "../features/workflow-header/WorkflowHeader.feature";
import { ResizeHandle, useResizable } from "../components/ResizeHandle/ResizeHandle.component";

// Its width: dragged by its right edge, kept in this browser.
const WIDTH = { initial: 224, min: 180, max: 480 };
// Components' and Variables' heights: each dragged by its top edge (up grows
// it), kept in this browser. Explorer takes what's left — 80px at least: past
// that the two shrink instead.
const SECTION_HEIGHT = { initial: 200, min: 72, max: 640 };
const EXPLORER_MIN_HEIGHT = 80;

export const PrimarySidebarLayout = () => {

	const width = useResizable({ storageKey: "studio.primarySidebar.width", ...WIDTH });
	const components = useResizable({ storageKey: "studio.primarySidebar.componentsHeight", ...SECTION_HEIGHT });
	const variables = useResizable({ storageKey: "studio.primarySidebar.variablesHeight", ...SECTION_HEIGHT });

	return (

		<div className="relative h-full shrink-0" style={{ width: width.size }}>
			<Sidebar
				side="right"
				className="w-full grid grid-cols-1"
				style={{ gridTemplateRows: `auto minmax(${EXPLORER_MIN_HEIGHT}px, 1fr) minmax(0, ${components.size}px) minmax(0, ${variables.size}px)` }}
			>
				<WorkflowHeader />
				<ExplorerTree />
				<div className="relative min-h-0">
					<ResizeHandle edge="top" size={components.size} onResize={(height, done) => components.setSize(height, done)} />
					<ComponentsTree />
				</div>
				<div className="relative min-h-0">
					<ResizeHandle edge="top" size={variables.size} onResize={(height, done) => variables.setSize(height, done)} />
					<VariablesTree />
				</div>
			</Sidebar>
			<ResizeHandle edge="right" size={width.size} onResize={(next, done) => width.setSize(next, done)} />
		</div>

	);

}
