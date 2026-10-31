import { Button, Text, Tree } from "@henglosio/ui";
import { shapeLabel, type IVariableRuntime, type IWorkflowRuntime } from "@henglosio/workflow";
import { Binary, Braces, Hash, List, Pencil, ToggleLeft, Trash, Type } from "lucide-react";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";
import { useBindDraggable } from "@/features/studio/lib/bindDrag";
import { anchorOf, type VariableDialogAnchor } from "./VariableDialog.component";
import { useAtomValue } from "jotai";
import { BoardLimitsAtom } from "@/features/studio/store/platform.store";

const TYPE_ICON = {
	number: Hash,
	integer: Binary,
	boolean: ToggleLeft,
	text: Type,
	array: List,
	object: Braces,
} as const;

const formatInitial = (variable: IVariableRuntime) =>
	variable.type === "text" || variable.type === "array" || variable.type === "object" ? JSON.stringify(variable.initial) : String(variable.initial);

type VariableItemTreeProps = {
	variable: IVariableRuntime;
	workflow: IWorkflowRuntime;
	onEdit: (anchor: VariableDialogAnchor) => void;
};

// How many configs read this variable and how many Sets write it — shown so
// removing one that's in use isn't a surprise.
const usage = (workflow: IWorkflowRuntime, variableId: string) => {
	const actions = [workflow.start, ...workflow.components.flatMap(component => component.actions)];
	const configs = actions.flatMap(action => action.configurations);
	return {
		reads: configs.filter(config => config.binding && "variableId" in config.binding && config.binding.variableId === variableId).length,
		writes: configs.filter(config => !config.binding && config.base.type === "variable" && config.value === variableId).length,
	};
};

export const VariableItemTree: React.FC<VariableItemTreeProps> = ({ variable, workflow, onEdit }) => {

	const mutate = useWorkflowMutate();
	const { bind, isDragging } = useBindDraggable(`variable:${variable.id}`, { kind: "variable", variableId: variable.id, name: variable.name });
	// A text initial value set under a bigger limit than the board has now won't compile.
	const maxText = useAtomValue(BoardLimitsAtom).protocol.maxData;
	const encoded = variable.initial === null ? null
		: variable.type === "text" ? variable.initial as string
		: variable.type === "array" || variable.type === "object" ? JSON.stringify(variable.initial)
		: null;
	const tooLong = encoded !== null && new TextEncoder().encode(encoded).length > maxText;

	const { reads, writes } = usage(workflow, variable.id);
	const Icon = TYPE_ICON[variable.type] ?? Hash;
	const inUse = reads + writes > 0;

	const onRemove = () => {
		if (inUse && !window.confirm(`"${variable.name}" is used by ${reads} binding(s) and ${writes} Set action(s). Remove it anyway?`)) return;
		mutate({ op: "remove:variable", variableId: variable.id });
	};

	return (

		<Tree.Item
			{...bind}
			title="Drag onto a config to bind it to this variable"
			className={isDragging ? "cursor-grabbing opacity-50" : "cursor-grab"}
		>

			<Tree.Icon className="text-accent-fg" title={variable.shape ? shapeLabel(variable.shape) : variable.type}>
				<Icon size={14} />
			</Tree.Icon>

			<Text variant="dim" size="sm" font="mono" className="truncate">{variable.name}</Text>

			{variable.initial !== null && (
				<Text
					variant="low"
					size="xs"
					font="mono"
					className={tooLong ? "truncate text-danger!" : "truncate"}
					title={tooLong ? `Longer than the board's ${maxText}-byte config value size — edit it or raise the limit in Platform settings` : undefined}
				>
					= {formatInitial(variable)}
				</Text>
			)}

			<div className="ml-auto flex items-center gap-0.5">

				<div className="flex gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity duration-100">
					<Button.Root variant="ghost" className="p-2!" onClick={e => { e.stopPropagation(); onEdit(anchorOf(e.currentTarget.closest<HTMLElement>("[role=button]") ?? e.currentTarget)); }}>
						<Button.Icon>
							<Pencil size={12} />
						</Button.Icon>
					</Button.Root>
					<Button.Root variant="ghost" className="p-2!" onClick={e => { e.stopPropagation(); onRemove(); }}>
						<Button.Icon>
							<Trash size={12} />
						</Button.Icon>
					</Button.Root>
				</div>

			</div>

		</Tree.Item>

	);

};
