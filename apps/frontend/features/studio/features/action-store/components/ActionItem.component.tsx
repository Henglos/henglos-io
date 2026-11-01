import { Button, Text } from "@henglosio/ui";
import { IActionSchema } from "@henglosio/workflow";
import { Plus } from "lucide-react";
import { NodeMark } from "@/features/studio/components/ActionIcon/ActionIcon.component";
import { TriggerTag } from "@/features/studio/components/NodePorts/CardPort";

interface IActionItemProps {
	action: IActionSchema;
	/** One of its component's triggers. */
	trigger?: boolean;
	onAdd: (action: IActionSchema) => void;
}

export const ActionItem: React.FC<IActionItemProps> = ({ action, trigger = false, onAdd }) => {

	return (

		<div className="group/row flex items-center gap-2 px-2 py-2 hover:bg-hover transition-colors">

			<NodeMark icon={action.icon} trigger={trigger} />

			<div className="flex flex-col min-w-0 flex-1 gap-0.5">
				<div className="flex items-center gap-1.5 min-w-0">
					<Text variant="dim" size="sm" className="truncate">{action.displayName}</Text>
					{trigger && <TriggerTag />}
				</div>
				{action.description && (
					<Text variant="low" size="xs" className="truncate">{action.description}</Text>
				)}
			</div>

			<Button.Root
				variant="ghost"
				className="shrink-0 p-2! opacity-0 group-hover/row:opacity-100 transition-opacity duration-100"
				onClick={() => onAdd(action)}
			>
				<Button.Icon>
					<Plus size={14} />
				</Button.Icon>
			</Button.Root>

		</div>

	);

};
