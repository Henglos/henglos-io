import { useEffect } from "react";
import { useAtom, useSetAtom } from "jotai";
import { NodeProps, Node, useUpdateNodeInternals } from "@xyflow/react";
import { Button, Text } from "@henglosio/ui";
import { getActionOutputs, isLogicComponent, isTriggerAction, RemoveActionFromWorkflowComponent } from "@henglosio/workflow";
import type { IConfigurationRuntime } from "@henglosio/workflow";
import { AlertCircle, Eye, EyeOff, GitBranch, Loader2, Play, Radio, Repeat, Split, Trash } from "lucide-react";
import clsx from "clsx";
import { WorkflowAtom } from "../../store/workflow.store";
import { type ActionNodeData, WorkspaceSelectionAtom } from "../../store/canvas.store";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";
import { DebugBadges, debugCardClass, debugRootClass, useDebugMark } from "../NodePorts/DebugMarks";
import { CardPort, CardPorts, cardShapeClass, TriggerMark, TriggerTag } from "../NodePorts/CardPort";
import { mergeConfigurations } from "./lib/mergeConfigurations";
import { isConfigVisible } from "./lib/isConfigVisible";
import { summarizeConfiguration } from "./lib/summarizeConfiguration";
import { useActionResult } from "@/features/studio/hooks/useActionResult";
import { useDebugger } from "@/features/studio/hooks/useDebugger";
import { ActionIcon, nodeIcon } from "@/features/studio/components/ActionIcon/ActionIcon.component";
import { CircleSlash } from "lucide-react";
import { missingCapabilities, nodeCapabilities } from "@henglosio/workflow";

// The compact action (NODE_LAYOUT "panel" / "sidebar"): what it is, its ports
// inside the card, how its last run went, and ▶ / disable / delete.
// Editing happens in the inspector, for the action selected. The card with
// everything inside is ActionNodeLegacy.
//
// A trigger (Timer, Pin, a request coming in…) starts its own branch: no
// input, and its ▶ is Listen — a debug session from it, waiting for it to fire.

const DEFAULT_INPUT = { id: "default", base: { id: "default", name: "in" } };

// The Logic actions read as flow, not hardware — their own icon in the header.
const LogicIcon: React.FC<{ action: string }> = ({ action }) => {
	const Icon = action === "Repeat" ? Repeat : action === "Switch" ? Split : GitBranch;
	return <Icon size={14} className="shrink-0 text-accent-fg" />;
};

// An output named after a config of the action (Switch's "Case 1") shows what
// that config is set to — "Case 1 · 10" — so each branch says when it's taken.
const portLabel = (name: string, configurations: IConfigurationRuntime[]): string => {
	const config = configurations.find(c => c.base.displayName === name);
	if (!config) return name;
	if (config.binding) return `${name} · bound`;
	return typeof config.value === "string" && config.value !== "" ? `${name} · ${config.value.slice(0, 16)}` : name;
};

export const ActionNode = ({ id, data, selected }: NodeProps<Node<ActionNodeData>>) => {

	const [workflow, setWorkflow] = useAtom(WorkflowAtom);
	const setSelection = useSetAtom(WorkspaceSelectionAtom);
	const mutate = useWorkflowMutate();
	const debugMark = useDebugMark(id);
	const { shown, runner, debugging } = useActionResult(id);
	const debug = useDebugger();
	const updateNodeInternals = useUpdateNodeInternals();

	const { component, action } = data;

	const onToggleDisabled = () =>
		mutate({ op: "update:action-disabled", componentId: component.id, actionId: action.id, disabled: !action.disabled });

	const onDelete = () => {
		if (!workflow) return;
		const { workflow: updated } = new RemoveActionFromWorkflowComponent().execute(workflow.data, component.id, action.id);
		setWorkflow({ ...workflow, data: updated });
		setSelection(previous => previous
			.map(selection => selection.componentId === component.id
				? { ...selection, actionId: selection.actionId.filter(selected => selected !== action.id) }
				: selection)
			.filter(selection => selection.actionId.length > 0));
	};
	const trigger = isTriggerAction(action);
	const inputs = trigger ? [] : action.inputs.length > 0 ? action.inputs : [DEFAULT_INPUT];
	// Always includes the derived "fallback" handle — see getActionOutputs.
	const outputs = getActionOutputs(action);
	const disabled = !!action.disabled;
	const logic = isLogicComponent(component);
	// What it needs of the board that the board doesn't have (wifi…) — Play refuses it.
	const unsupported = workflow ? missingCapabilities(workflow.data.board.base, nodeCapabilities(component, action)) : [];

	const configurations = mergeConfigurations(action.base.configurations, action.configurations);
	const visible = configurations.filter(configuration => isConfigVisible(configuration, configurations));
	const variables = workflow?.data.variables ?? [];
	// Required configs left empty — an icon in the header names them.
	const missing = visible
		.map(configuration => summarizeConfiguration(configuration, variables))
		.filter(summary => summary.missing)
		.map(summary => summary.name);
	const fallback = shown?.output.name === "Fallback";
	const rows = Math.max(inputs.length, outputs.length);

	// The ports are rows of the card: re-measured when their count or the card changes.
	const hasResult = !!shown;
	useEffect(() => {
		updateNodeInternals(id);
	}, [id, rows, hasResult, updateNodeInternals]);

	return (

		<div className={clsx("relative w-64", debugRootClass(debugMark))}>

			<DebugBadges mark={debugMark} />

			<div
				className={clsx(
					"relative flex flex-col bg-raised border w-full transition-[border-color,box-shadow,opacity] duration-150",
					cardShapeClass(trigger),
					debugCardClass(debugMark, selected),
					// Off: faded and dashed — still selectable, back to full on hover.
					disabled && "border-dashed opacity-55 hover:opacity-100",
				)}
			>

				{/* What it is. */}
				<div className={clsx("flex flex-col gap-0.5 pt-2.5 pb-2 pr-3", trigger ? "pl-4" : "pl-3")}>
					<div className="flex items-center gap-2">
						{logic && <ActionIcon icon={nodeIcon(component, action)} fallback={<LogicIcon action={action.base.displayName} />} className="shrink-0 text-accent-fg" />}
						{trigger && <TriggerMark><ActionIcon icon={nodeIcon(component, action)} fallback={<Radio size={13} />} size={13} /></TriggerMark>}
						{!logic && !trigger && <ActionIcon icon={nodeIcon(component, action)} fallback={null} className="shrink-0 text-fg-muted" />}
						<Text variant="high" font="mono" size="sm" className={clsx("truncate flex-1", disabled && "line-through decoration-fg-muted")}>{action.alias}</Text>
						{runner.running && <Loader2 size={12} className="shrink-0 animate-spin text-fg-muted" />}
						{disabled && <EyeOff size={12} className="shrink-0 text-fg-muted" aria-label="Disabled — the flow skips it" />}
						{trigger && <TriggerTag />}
						{unsupported.length > 0 && (
							<span title={`Needs ${unsupported.join(", ")} — ${workflow?.data.board.base.name ?? "the board"} doesn't have ${unsupported.length === 1 ? "it" : "them"}`} className="shrink-0 text-danger">
								<CircleSlash size={12} />
							</span>
						)}
						{missing.length > 0 && (
							<span title={`Required: ${missing.join(", ")}`} className="shrink-0 text-danger">
								<AlertCircle size={12} />
							</span>
						)}
					</div>
					<Text variant="low" size="xs" className={clsx("truncate", trigger && "pl-8")}>
						{logic ? "Logic" : component.alias}
					</Text>
				</div>

				{/* Ports: inputs on the left, outputs on the right — Fallback last. */}
				<CardPorts
					inputs={inputs.map(input => (
						<CardPort key={input.id} id={input.id} type="target" label={input.base.name} />
					))}
					outputs={outputs.map(output => (
						<CardPort
							key={output.id}
							id={output.id}
							type="source"
							label={portLabel(output.base.name, configurations)}
							tone={output.base.id === "fallback" ? "danger" : "default"}
							active={shown?.output.name === output.base.name}
						/>
					))}
				/>

				{/* How the last run went. */}
				{shown ? (
					<div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-line-subtle bg-field">
						<span className={clsx("size-1.5 shrink-0 rounded-full", fallback ? "bg-danger" : "bg-accent")} />
						<Text variant="dim" size="xs" font="mono" className={clsx("truncate", fallback && "text-danger!")}>{shown.output.name}</Text>
						<Text variant="low" size="xs" className="ml-auto shrink-0 tabular-nums">{shown.ranAt.toLocaleTimeString()}</Text>
					</div>
				) : runner.error ? (
					<div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-line-subtle bg-field">
						<span className="size-1.5 shrink-0 rounded-full bg-danger" />
						<Text variant="low" size="xs" className="text-danger! truncate" title={runner.error}>{runner.error}</Text>
					</div>
				) : null}

				{/* ▶ alone, skip it in the flow, remove it. */}
				<div className="nodrag flex items-center gap-1 px-1.5 py-1 border-t border-line-subtle">
					{trigger ? (
						<Button.Root
							size="sm"
							variant="ghost"
							onClick={() => void debug.start(action.id)}
							disabled={!!debug.unavailable || debugging || disabled}
							title={debugging ? "Already debugging" : disabled ? "Enable it to listen" : debug.unavailable ?? "Listen — debug from this trigger: wait for it to fire, then step through its branch"}
						>
							<Button.Icon><Radio size={12} /></Button.Icon>
							<Button.Label>Listen</Button.Label>
						</Button.Root>
					) : (
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
					<Button.Root
						size="sm"
						variant="ghost"
						onClick={onToggleDisabled}
						aria-pressed={disabled}
						className={clsx(disabled && "text-accent-fg!")}
						title={disabled ? "Enable — run it again when the flow reaches it" : "Disable — the flow skips it and goes on to the next action"}
					>
						<Button.Icon>{disabled ? <Eye size={12} /> : <EyeOff size={12} />}</Button.Icon>
					</Button.Root>
					<Button.Root size="sm" variant="ghost" onClick={onDelete} title="Remove this action" className="ml-auto">
						<Button.Icon><Trash size={12} /></Button.Icon>
					</Button.Root>
				</div>

			</div>

		</div>

	);
};
