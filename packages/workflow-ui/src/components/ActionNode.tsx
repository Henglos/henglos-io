import { Fragment, useEffect } from "react";
import { useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { Text } from "@henglosio/ui";
import { getActionOutputs, isLogicComponent, isTriggerAction, missingCapabilities, nodeCapabilities, type IConfigurationRuntime } from "@henglosio/workflow";
import clsx from "clsx";
import { AlertCircle, CircleSlash, EyeOff, Radio } from "lucide-react";
import { CardPort, CardPorts, cardShapeClass, TriggerMark, TriggerTag } from "./NodePorts";
import { ActionIcon, LogicIcon, nodeIcon } from "./ActionIcon";
import { isConfigVisible, mergeConfigurations } from "../lib/configurations";
import { summarizeConfiguration } from "../lib/summarizeConfiguration";
import { useNodeExtras, useWorkflowCanvas } from "../context";
import type { ActionNodeData } from "../types";

const DEFAULT_INPUT = { id: "default", base: { id: "default", name: "in" } };

/** The card's border when the app doesn't set one: the selection outline. */
export const defaultCardClass = (selected: boolean | undefined) =>
	selected ? "border-accent-line ring-1 ring-accent-line" : "border-line-subtle";

// An output named after a config of the action (Switch's "Case 1") shows what
// that config is set to — "Case 1 · 10" — so each branch says when it's taken.
const portLabel = (name: string, configurations: IConfigurationRuntime[]): string => {
	const config = configurations.find(c => c.base.displayName === name);
	if (!config) return name;
	if (config.binding) return `${name} · bound`;
	return typeof config.value === "string" && config.value !== "" ? `${name} · ${config.value.slice(0, 16)}` : name;
};

// An action as a compact card — the studio's: its icon, name and component,
// what's off about it (switched off, a required config left empty, something
// the board doesn't have), its ports inside the card (inputs left, outputs
// right, Fallback last), and whatever the app adds (extras: values, a
// footer). A trigger starts its own branch: no input, a round left side.
export const ActionNode = ({ id, data, selected }: NodeProps<Node<ActionNodeData>>) => {

	const canvas = useWorkflowCanvas();
	const workflow = canvas.workflow;
	const { component, action } = data;
	const extras = useNodeExtras({ id, component, action, selected: !!selected, start: false });
	const updateNodeInternals = useUpdateNodeInternals();

	const trigger = isTriggerAction(action);
	const logic = isLogicComponent(component);
	const disabled = !!action.disabled;
	const inputs = trigger ? [] : action.inputs.length > 0 ? action.inputs : [DEFAULT_INPUT];
	// Always ends with the "fallback" handle (red) — derived, not stored.
	const outputs = getActionOutputs(action);
	const outputSchema = action.base.outputSchema ?? [];
	const locked = !!canvas.readOnly;
	const rows = Math.max(inputs.length, outputs.length);

	const configurations = mergeConfigurations(action.base.configurations, action.configurations);
	const visible = configurations.filter(configuration => isConfigVisible(configuration, configurations));
	// Required configs left empty — an icon in the header names them.
	const missing = visible
		.map(configuration => summarizeConfiguration(configuration, workflow?.variables ?? []))
		.filter(summary => summary.missing)
		.map(summary => summary.name);
	// What it needs of the board that the board doesn't have (wifi…).
	const unsupported = workflow ? missingCapabilities(workflow.board.base, nodeCapabilities(component, action)) : [];

	// The ports are rows of the card: re-measured when their count changes.
	useEffect(() => {
		updateNodeInternals(id);
	}, [id, rows, updateNodeInternals]);

	return (

		<div className={clsx("relative w-64", extras.rootClassName)}>

			{extras.badges}

			<div
				className={clsx(
					"relative flex flex-col bg-raised border w-full transition-[border-color,box-shadow,opacity] duration-150",
					cardShapeClass(trigger),
					extras.cardClassName ?? defaultCardClass(selected),
					// Off: faded and dashed — back to full on hover.
					disabled && "border-dashed opacity-55 hover:opacity-100",
				)}
			>

				{/* What it is. */}
				<div className={clsx("flex flex-col gap-0.5 pt-2.5 pb-2 pr-3", trigger ? "pl-4" : "pl-3")} title={action.base.description}>
					<div className="flex items-center gap-2">
						{logic && <ActionIcon icon={nodeIcon(component, action)} fallback={<LogicIcon action={action.base.displayName} />} className="shrink-0 text-accent-fg" />}
						{trigger && <TriggerMark><ActionIcon icon={nodeIcon(component, action)} fallback={<Radio size={13} />} size={13} /></TriggerMark>}
						{!logic && !trigger && <ActionIcon icon={nodeIcon(component, action)} fallback={null} className="shrink-0 text-fg-muted" />}
						<Text variant="high" font="mono" size="sm" className={clsx("truncate flex-1", disabled && "line-through decoration-fg-muted")}>{action.alias}</Text>
						{disabled && <EyeOff size={12} className="shrink-0 text-fg-muted" aria-label="Disabled — the flow skips it" />}
						{trigger && <TriggerTag />}
						{unsupported.length > 0 && (
							<span title={`Needs ${unsupported.join(", ")} — ${workflow?.board.base.name ?? "the board"} doesn't have ${unsupported.length === 1 ? "it" : "them"}`} className="shrink-0 text-danger">
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
						<CardPort key={input.id} id={input.id} type="target" label={input.base.name} locked={locked} />
					))}
					outputs={outputs.map(output => (
						<CardPort
							key={output.id}
							id={output.id}
							type="source"
							label={portLabel(output.base.name, configurations)}
							tone={output.base.id === "fallback" ? "danger" : "default"}
							active={extras.activeOutput === output.base.name}
							locked={locked}
						/>
					))}
				/>

				{/* What the app shows of the outputs (a run's values) — empty:hidden without it. */}
				<div className="flex flex-col border-t border-line-subtle empty:hidden">
					{extras.outputsHeader}
					{extras.outputValue && outputSchema.map(output => (
						<Fragment key={output.name}>{extras.outputValue!(output.name)}</Fragment>
					))}
					{extras.outputsFooter}
				</div>

				{extras.footer && <div className="flex gap-1 px-1.5 py-1 border-t border-line-subtle">{extras.footer}</div>}

			</div>

		</div>

	);
};
