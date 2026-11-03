import { useState } from "react";
import type { IActionSchema, IComponentRuntime } from "@henglosio/workflow";
import { componentNodes } from "@henglosio/workflow";
import { Input, Text } from "@henglosio/ui";
import { Search, Zap } from "lucide-react";
import { ActionItem } from "./ActionItem.component";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";

type ActionStoreListProps = {
	component: IComponentRuntime;
	onAdded?: (action: IActionSchema) => void;
};

export const ActionStoreList: React.FC<ActionStoreListProps> = ({ component, onAdded }) => {

	const mutate = useWorkflowMutate();
	const [query, setQuery] = useState("");

	const onAdd = async (action: IActionSchema) => {

		await mutate({
			op: "add:action",
			actionName: action.displayName,
			componentId: component.id,
		});

		onAdded?.(action);

	};

	const q = query.toLowerCase();
	// Its triggers, then its actions.
	const filteredActions = componentNodes(component.base).filter(({ schema: action }) =>
		action.displayName.toLowerCase().includes(q) ||
		action.description.toLowerCase().includes(q)
	);

	return (

		<>

			<Input.Root className="h-6">
				<Input.Label>
					<Search size={13} />
				</Input.Label>
				<Input.Field
					placeholder="Search..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</Input.Root>

			{filteredActions.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-2 py-8">
					<Zap size={20} className="text-fg-muted" />
					<Text variant="low" size="xs">No actions found.</Text>
				</div>
			) : (
				<div className="flex flex-col">
					{filteredActions.map(({ schema: action, trigger }) => (
						<ActionItem
							key={`${component.id}_${action.displayName}`}
							action={action}
							trigger={trigger}
							onAdd={onAdd}
						/>
					))}
				</div>
			)}

		</>

	);

};
