import { Button, Text, Tree } from "@henglosio/ui";
import { useAtomValue, useSetAtom } from "jotai";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { ActionStoreTargetAtom, ComponentStoreOpenAtom } from "@/features/studio/store/canvas.store";
import { ComponentItemTree } from "./components/ComponentItemTree.component";
import { Plus } from "lucide-react";
import { isCoreComponent } from "@henglosio/workflow";

export const ComponentsTree = () => {

	const workflow = useAtomValue(WorkflowAtom);
	// The built-ins aren't installed packages: Variables is managed from the
	// Variables list, Logic is always in the action pickers.
	const components = (workflow?.data.components ?? [])
		.filter(component => !isCoreComponent(component))
		// Alphabetical, like the action pickers.
		.sort((a, b) => a.alias.localeCompare(b.alias, undefined, { sensitivity: "base" }));
	const setActionStoreTarget = useSetAtom(ActionStoreTargetAtom);
	const setComponentStoreOpen = useSetAtom(ComponentStoreOpenAtom);

	const openComponentStore = () => {
		setActionStoreTarget(null);
		setComponentStoreOpen(true);
	};

	return (

		// Its own height range, scrolling inside past it — it doesn't take room from the others.
		<div className="flex flex-col h-full overflow-auto">

			<div className="p-2 h-8 flex items-center justify-between">
				<Text variant="low" size="xs" font="mono">Components</Text>
				<Button.Root variant="ghost" onClick={openComponentStore}>
					<Button.Icon>
						<Plus size={12}/>
					</Button.Icon>
				</Button.Root>
			</div>

			<Tree.Root className="w-full flex-1 min-h-0 overflow-y-auto">

				{!components.length ? (
					<div className="px-4">
						<Text variant="low" size="xs">No components added yet.</Text>
					</div>
				) : (
					components.map(component => (
						<ComponentItemTree key={component.id} data={component} />
					))
				)}

			</Tree.Root>

		</div>

	);

};
