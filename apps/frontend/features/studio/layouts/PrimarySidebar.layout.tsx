import { Sidebar } from "@/shared/components/Sidebar.component";
import { ExplorerTree } from "../features/explorer-tree/ExplorerTree.feature";
import { ComponentsTree } from "../features/components-tree/ComponentsTree.feature";
import { VariablesTree } from "../features/variables-tree/VariablesTree.feature";
import { WorkflowHeader } from "../features/workflow-header/WorkflowHeader.feature";

export const PrimarySidebarLayout = () => {

	return (

		<Sidebar side="right" className="grid grid-cols-1 grid-rows-[auto_1fr_0.4fr_0.4fr]">
			<WorkflowHeader />
			<ExplorerTree />
			<ComponentsTree />
			<VariablesTree />
		</Sidebar>

	);

}
