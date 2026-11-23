import { Button, Text } from "@henglosio/ui";
import { isLogicComponent, isTriggerAction } from "@henglosio/workflow";
import { Eye, EyeOff, Loader2, Play, StickyNote, Trash, X } from "lucide-react";
import clsx from "clsx";
import { START_NODE_ID } from "@/features/studio/store/canvas.store";
import { TriggerTag } from "@/features/studio/components/NodePorts/CardPort";
import type { Inspector } from "../useInspector";
import { ActionIcon, nodeIcon } from "@/features/studio/components/ActionIcon/ActionIcon.component";

type InspectorHeaderProps = {
	inspector: Inspector;
	/** Shown: a button that toggles the notes, lit while they're open or set. */
	notesOpen?: boolean;
	onToggleNotes?: () => void;
	/** Clicking the last run's line — to bring the output into view. */
	onShowOutput?: () => void;
};

/** What's selected, how its last run went, and what can be done to it. */
export const InspectorHeader: React.FC<InspectorHeaderProps> = ({ inspector, notesOpen, onToggleNotes, onShowOutput }) => {

	const { action, component, shown, runner, debugging, disabled, notes, onRename } = inspector;
	const fallback = shown?.output.name === "Fallback";
	// Start can't run alone, be skipped or removed — only set.
	const start = component.id === START_NODE_ID;
	// A trigger doesn't run alone — the node's Listen debugs from it.
	const trigger = !start && isTriggerAction(action);

	return (

		<div className="flex flex-col gap-1 px-4 py-2.5 shrink-0 border-b border-line">

			<div className="flex items-center gap-1">
				<div className="flex items-baseline gap-2 min-w-0 flex-1" title={action.base.description}>
					<ActionIcon icon={nodeIcon(component, action)} fallback={null} size={13} className="shrink-0 self-center text-fg-muted" />
					<Text
						variant="high" font="mono" size="sm"
						className={clsx("truncate", disabled && "line-through decoration-fg-muted")}
						editable dbClick value={action.alias} onChange={onRename} placeholder={action.base.displayName}
						inputClassName="font-mono"
					/>
					<Text variant="low" size="xs" className="truncate">{isLogicComponent(component) ? "Logic" : component.alias}</Text>
					{(start || trigger) && <span className="self-center"><TriggerTag /></span>}
				</div>
				{!start && !trigger && (
					<Button.Root
						size="sm"
						variant="ghost"
						onClick={runner.run}
						disabled={!!runner.unavailable || runner.running || debugging}
						title={debugging ? "Stop debugging to run an action alone" : runner.unavailable ?? "Run this action alone on the board — outside the flow"}
					>
						<Button.Icon>{runner.running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}</Button.Icon>
					</Button.Root>
				)}
				{onToggleNotes && (
					<Button.Root size="sm" variant="ghost" onClick={onToggleNotes} aria-pressed={notesOpen} className={clsx((notesOpen || notes) && "text-accent-fg!")} title="Notes">
						<Button.Icon><StickyNote size={12} /></Button.Icon>
					</Button.Root>
				)}
				{!start && (
					<>
						<Button.Root
							size="sm"
							variant="ghost"
							onClick={inspector.onToggleDisabled}
							aria-pressed={disabled}
							className={clsx(disabled && "text-accent-fg!")}
							title={disabled ? "Enable — run it again when the flow reaches it" : "Disable — the flow skips it and goes on to the next action"}
						>
							<Button.Icon>{disabled ? <Eye size={12} /> : <EyeOff size={12} />}</Button.Icon>
						</Button.Root>
						<Button.Root size="sm" variant="ghost" onClick={inspector.onDelete} title="Remove this action">
							<Button.Icon><Trash size={12} /></Button.Icon>
						</Button.Root>
					</>
				)}
				<Button.Root size="sm" variant="ghost" onClick={inspector.close} title="Close">
					<Button.Icon><X size={12} /></Button.Icon>
				</Button.Root>
			</div>

			{shown ? (
				<button type="button" onClick={onShowOutput} className={clsx("flex items-center gap-1.5 w-fit", onShowOutput && "cursor-pointer")} title={`${shown.title} · ${shown.ranAt.toLocaleTimeString()}`}>
					<span className={clsx("size-1.5 rounded-full", fallback ? "bg-danger" : "bg-accent")} />
					<Text variant="dim" size="xs" font="mono" className={fallback ? "text-danger!" : undefined}>{shown.output.name}</Text>
				</button>
			) : runner.error ? (
				<div className="flex items-start gap-1.5">
					<span className="mt-1 size-1.5 shrink-0 rounded-full bg-danger" />
					<Text variant="low" size="xs" className="text-danger! wrap-break-word flex-1 min-w-0">{runner.error}</Text>
					<button type="button" onClick={runner.clear} className="shrink-0 cursor-pointer text-fg-muted hover:text-fg" title="Dismiss"><X size={11} /></button>
				</div>
			) : null}

		</div>

	);

};
