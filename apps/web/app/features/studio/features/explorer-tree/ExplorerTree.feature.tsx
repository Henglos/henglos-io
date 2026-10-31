import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { PendingAddActionAtom } from "@/features/studio/store/canvas.store";
import { Button, Input, Skeleton, Text, Tree } from "@henglosio/ui";
import { useAtomValue, useSetAtom } from "jotai";
import { Plus, Search } from "lucide-react";
import { ActionTreeItem } from "./components/ActionItemTree.component";
import { ExplorerAddActionStore } from "./components/ExplorerAddActionStore.component";
import { useTreeSelection } from "./hooks/useTreeSelection.hook";

export const ExplorerTree = () => {

	const workflow = useAtomValue(WorkflowAtom);
	const { isActionSelected } = useTreeSelection();
	const setPendingAddAction = useSetAtom(PendingAddActionAtom);

	const openAddAction = (e: React.MouseEvent) => {
		setPendingAddAction({ screenPosition: { x: e.clientX, y: e.clientY } });
	};

	const actions = workflow
		? [...workflow.data.board.actions, ...workflow.data.components.flatMap(component => component.actions)]
		: [];

	return (

		// flex-1 + min-h-0: takes the sidebar's leftover height and scrolls its
		// list inside it — without min-h-0 it grows with every action and
		// squeezes Components and Variables.
		<div className="flex flex-col flex-1 min-h-0">

			<div className="p-2 h-8 flex items-center justify-between">
				<Text className="select-none" variant="low" size="xs" font="sans">Explorer</Text>
				<Button.Root variant="ghost" onClick={openAddAction}>
					<Button.Icon>
						<Plus size={12}/>
					</Button.Icon>
				</Button.Root>
			</div>

			<div className="px-2">
				<Input.Root>
					<Input.Icon>
						<Search size={14} />
					</Input.Icon>
					<Input.Field placeholder="Search..." />
				</Input.Root>
			</div>

			<Tree.Root className="w-full flex-1 min-h-0 mt-2 overflow-y-auto">

				{
					!workflow ? (
						<Skeleton />
					) : (
						actions.map(action => (
							<ActionTreeItem key={action.id} selected={isActionSelected(action.id)} data={action} />
						))
					)
				}

			</Tree.Root>

			<ExplorerAddActionStore />

		</div>

	);

}
