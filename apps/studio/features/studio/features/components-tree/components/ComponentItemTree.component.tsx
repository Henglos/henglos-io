import { Button, Text, Tree } from "@henglosio/ui";
import type { IComponentRuntime } from "@henglosio/workflow";
import { Box, Trash } from "lucide-react";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";

type ComponentItemTreeProps = {
	data: IComponentRuntime;
}

export const ComponentItemTree: React.FC<ComponentItemTreeProps> = ({ data }) => {

	const mutate = useWorkflowMutate();
	const onRemove = () => mutate({ op: "remove:component", componentId: data.id });

	return (

		<Tree.Item>

			<Tree.Icon className="text-fg-muted">
				<Box size={14} />
			</Tree.Icon>

			<Text variant="dim" size="sm" className="flex-1 min-w-0 truncate" title={data.alias}>{data.alias}</Text>

			<div className="ml-auto shrink-0 flex gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity duration-100">

				<Button.Root variant="ghost" className="p-2!" onClick={e => { e.stopPropagation(); onRemove(); }}>
					<Button.Icon>
						<Trash size={12} />
					</Button.Icon>
				</Button.Root>

			</div>

		</Tree.Item>

	);

}
