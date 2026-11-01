import { useState } from "react";
import { useAtomValue } from "jotai";
import { Button, Text, Tree } from "@henglosio/ui";
import { Plus } from "lucide-react";
import type { IVariableRuntime } from "@henglosio/workflow";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { BoardLimitsAtom } from "@/features/studio/store/platform.store";
import { anchorOf, VariableDialog, type VariableDialogAnchor } from "./components/VariableDialog.component";
import { VariableItemTree } from "./components/VariableItemTree.component";

/**
 * The workflow's variables, under Components: create, rename, set the initial
 * value, remove — and drag one onto a config to bind it. Writing a variable at
 * run time is the "Variables / Set" action (added to the picker with the first
 * variable); scripts read one with `ctx.var("name")`.
 */
export const VariablesTree = () => {

	const workflow = useAtomValue(WorkflowAtom);
	const variables = workflow?.data.variables ?? [];
	const { values, protocol } = useAtomValue(BoardLimitsAtom);

	// The board's room for them: GlobalVariables holds MAX_VARIABLES, and every
	// initial value is one config of Start's EXECUTE, next to its own Mode.
	const capacity = values.MAX_VARIABLES;
	const initialRoom = protocol.maxConfigs - 1;
	const initials = variables.filter(variable => variable.initial !== null).length;
	// Open dialog: creating (no variable) or editing one.
	const [dialog, setDialog] = useState<{ variable?: IVariableRuntime; anchor: VariableDialogAnchor } | null>(null);

	return (

		// Its own height range, scrolling inside past it — it doesn't take room from the others.
		<div className="flex flex-col h-full overflow-auto">

			<div className="p-2 h-8 flex items-center justify-between">
				<Text variant="low" size="xs" font="mono">Variables</Text>
				{capacity !== undefined && variables.length > 0 && (
					<Text variant="low" size="xs" className={variables.length > capacity ? "tabular-nums ml-2 mr-auto text-danger!" : "tabular-nums ml-2 mr-auto"} title="Variables the board holds (Platform settings → Variables)">
						{variables.length}/{capacity}
					</Text>
				)}
				<Button.Root variant="ghost" onClick={e => setDialog({ anchor: anchorOf(e.currentTarget) })} disabled={!workflow}>
					<Button.Icon>
						<Plus size={12} />
					</Button.Icon>
				</Button.Root>
			</div>

			{dialog && workflow && (
				<VariableDialog
					// Re-mount per target, so switching from one variable to another resets the form.
					key={dialog.variable?.id ?? "new"}
					workflow={workflow.data}
					variable={dialog.variable}
					anchor={dialog.anchor}
					onClose={() => setDialog(null)}
				/>
			)}

			{capacity !== undefined && variables.length > capacity && (
				<Text variant="low" size="xs" className="px-4 pb-2 text-danger!">
					The board holds {capacity} variables — a Set past that goes out Fallback. Raise it in Platform settings.
				</Text>
			)}
			{initials > initialRoom && (
				<Text variant="low" size="xs" className="px-4 pb-2 text-danger!">
					Only {initialRoom} initial values fit in Start (Configs per action, in Platform settings) — the workflow won&apos;t compile.
				</Text>
			)}

			<Tree.Root className="w-full flex-1 min-h-0 overflow-y-auto">

				{!variables.length ? (
					<div className="px-4">
						<Text variant="low" size="xs">No variables yet — they're shared by every action and kept across loops.</Text>
					</div>
				) : (
					variables.map(variable => (
						<VariableItemTree key={variable.id} variable={variable} workflow={workflow!.data} onEdit={anchor => setDialog({ variable, anchor })} />
					))
				)}

			</Tree.Root>

		</div>

	);

};
