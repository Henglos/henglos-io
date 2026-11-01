import { Tree, Button, Text } from "@henglosio/ui";
import { IActionRuntime } from "@henglosio/workflow";
import clsx from "clsx";
import { Trash, Zap } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { useTreeSelection } from "../hooks/useTreeSelection.hook";
import { ActionIcon, nodeIcon } from "@/features/studio/components/ActionIcon/ActionIcon.component";

type ActionTreeItemProps = {
	data: IActionRuntime;
	selected: boolean;
}

export const ActionTreeItem: React.FC<ActionTreeItemProps> = ({ data, selected }) => {

	const { selectAction } = useTreeSelection();
	const itemRef = useRef<HTMLDivElement | null>(null);
	const mutate = useWorkflowMutate();
	// Its component — the icon its schema has now (see nodeIcon).
	const component = useAtomValue(WorkflowAtom)?.data.components.find(found => found.id === data.componentId);

	const onDelete = () => mutate({ op: "remove:action", componentId: data.componentId, actionId: data.id });

	const onKeyDown = (ev: KeyboardEvent) => {
		if (ev.key === "Delete") onDelete();
	};

	const onSelect = (ev: React.MouseEvent) => {
		selectAction(data.componentId, data.id, ev.shiftKey);
	};

	useEffect(() => {
		const el = itemRef.current;
		if (!el) return;
		el.addEventListener("keydown", onKeyDown);
		return () => el.removeEventListener("keydown", onKeyDown);
	}, [itemRef, data]);

	return (
		<div ref={itemRef} onClick={onSelect}>
			<Tree.Item className={clsx(
				"border-l-2 border-transparent hover:border-line-strong",
				selected && "border-accent! hover:border-accent-hover!",
			)}>

				<Tree.Icon className="text-fg-muted">
					<ActionIcon icon={nodeIcon(component, data)} fallback={<Zap size={14} />} />
				</Tree.Icon>

				<Text variant="dim" size="sm" editable dbClick>{data.alias}</Text>

				<Button.Root
					variant="ghost"
					className="ml-auto p-2! opacity-0 group-hover/row:opacity-100 transition-opacity duration-100"
					onClick={e => { e.stopPropagation(); onDelete(); }}
				>
					<Button.Icon>
						<Trash size={12} />
					</Button.Icon>
				</Button.Root>

			</Tree.Item>
		</div>
	);

}
