import { Fragment, useEffect, useRef, useState } from "react";
import { WorkflowAtom } from "../../store/workflow.store";
import { type ActionNodeData, WorkspaceSelectionAtom } from "../../store/canvas.store";
import { NodeProps, Node, useUpdateNodeInternals } from "@xyflow/react";
import { NodePort, NodePorts } from "../NodePorts/NodePorts";
import { DebugBadges, debugCardClass, debugRootClass, useDebugMark } from "../NodePorts/DebugMarks";
import { Eye, EyeOff, GitBranch, GripVertical, Info, Loader2, Play, Repeat, Split, Trash, X } from "lucide-react";
import { Button, Tabs, Text, Textarea, Tooltip } from "@henglosio/ui";
import { useAtom, useSetAtom } from "jotai";
import { actionPassesContext, getActionOutputs, isLogicComponent, isSwitchAction, isTriggerAction, RemoveActionFromWorkflowComponent, shapeLabel, switchCaseCount } from "@henglosio/workflow";
import type { IConfigurationRuntime } from "@henglosio/workflow";
import clsx from "clsx";
import { mergeConfigurations } from "./lib/mergeConfigurations";
import { isConfigVisible } from "./lib/isConfigVisible";
import { useBindDraggable } from "@/features/studio/lib/bindDrag";
import { ConfigurationField } from "./components/ConfigurationField.component";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";
import { useSyncedDraft } from "@/features/studio/lib/useSyncedDraft";
import { useRunAction } from "@/features/studio/hooks/useRunAction";
import { OutputValue, RunSummary } from "./components/OutputValue.component";
import { hasShapeFields, ShapeTree, shortShapeLabel } from "./components/ShapeTree.component";
import { useDebugger } from "@/features/studio/hooks/useDebugger";
import { PassContextField } from "@/features/studio/features/action-inspector/components/PassContextField.component";
import { SwitchCasesField } from "@/features/studio/features/action-inspector/components/SwitchCasesField.component";
import { ActionIcon, nodeIcon } from "@/features/studio/components/ActionIcon/ActionIcon.component";

const DEFAULT_INPUT = { id: "default", base: { id: "default", name: "in" } };

type NodeTab = "configuration" | "advanced" | "notes";

const NOTES_COMMIT_DELAY_MS = 400;

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

// An output's row — dragged onto a config to bind the config to it.
const OutputRow: React.FC<{ actionId: string; outputName: string; children: React.ReactNode }> = ({ actionId, outputName, children }) => {
	const { bind, isDragging } = useBindDraggable(`output:${actionId}:${outputName}`, { kind: "output", actionId, outputName });
	return (
		<div {...bind} className={clsx("flex flex-col gap-0.5 mx-1 rounded-sm nodrag cursor-grab active:cursor-grabbing outline-none hover:bg-hover", isDragging && "opacity-50")}>
			{children}
		</div>
	);
};

// The node as it was before the inspector — every config, tab, output and
// value inside the card. Kept whole so the studio can go back to it: see
// NODE_LAYOUT in lib/nodeLayout.ts.
export const ActionNodeLegacy = ({ id, data, selected }: NodeProps<Node<ActionNodeData>>) => {

	const [workflow, setWorkflow] = useAtom(WorkflowAtom);
	const setSelection = useSetAtom(WorkspaceSelectionAtom);
	const mutate = useWorkflowMutate();
	// ▶ — this action alone on the board, outside the flow.
	const runner = useRunAction(id);
	// Debug mode: this node just ran (its outputs, editable), or runs next.
	const debug = useDebugger();
	const debugRan = debug.session?.state.ran?.actionId === id ? debug.session.state.ran : null;
	const debugMark = useDebugMark(id);
	// Ran earlier in the branch being debugged — what it passed on (Pass Context).
	const debugEarlier = !debugRan ? debug.session?.history?.[id] ?? null : null;
	// What the node shows: the debugger's step while it's on this node, else the last ▶.
	const shown = debugRan && debug.session
		? {
			title: `Debug · step ${debug.session.state.step}`,
			output: debugRan.output,
			values: debugRan.values,
			ranAt: debug.session.ranAt,
			onEdit: debug.active ? debug.setValue : undefined,
			busy: debug.session.busy,
			onClose: undefined,
		}
		: debugEarlier && debug.session
		? { title: `Debug · step ${debugEarlier.step}`, output: debugEarlier.output, values: debugEarlier.values, ranAt: debug.session.ranAt, onEdit: undefined, busy: false, onClose: undefined }
		: runner.result && runner.ranAt
			? { title: "Ran alone", output: runner.result.output, values: runner.result.values, ranAt: runner.ranAt, onEdit: undefined, busy: false, onClose: runner.clear }
			: null;
	const shownOutput = shown?.output;
	const valueOf = (name: string) => shown?.values.find(value => value.name === name);

	const { component, action } = data;
	const inputs = action.inputs.length > 0 ? action.inputs : [DEFAULT_INPUT];
	// Always includes the "fallback" handle (red, at the bottom), derived — it
	// doesn't depend on being saved in action.outputs (see getActionOutputs).
	const outputs = getActionOutputs(action);
	const updateNodeInternals = useUpdateNodeInternals();
	const [tab, setTab] = useState<NodeTab>("configuration");
	const [notes, setNotes] = useSyncedDraft(action.notes ?? "", v => v);
	const notesTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const pendingNotesRef = useRef<string | null>(null);

	const board = workflow?.data.board;
	const actionConfigurations = mergeConfigurations(action.base.configurations, action.configurations);
	// Visibility is evaluated over the whole list: a basic config may show/hide
	// on an advanced one (displayOptions reference siblings by displayName).
	const visibleConfigurations = actionConfigurations.filter(c => isConfigVisible(c, actionConfigurations));
	const basicConfigurations = visibleConfigurations.filter(c => !c.base.advanced);
	const advancedConfigurations = visibleConfigurations.filter(c => c.base.advanced);
	const outputSchema = action.base.outputSchema ?? [];
	// Advanced › Pass Context — not on a trigger (nothing before it to pass on).
	const canPassContext = !!workflow && !isTriggerAction(action);
	const passContext = !!workflow && actionPassesContext(workflow.data, action.id);
	// Values the action published that no output row declares.
	const undeclared = shown?.values.filter(value => !outputSchema.some(output => output.name === value.name)) ?? [];

	const onChangeActionValue = (configurationId: string, value: IConfigurationRuntime["value"]) => {
		mutate({
			op: "update:configuration",
			componentId: component.id,
			actionId: action.id,
			configurationId,
			value,
		});
	};

	const onBindOutput = (configurationId: string, sourceActionId: string, outputName: string) => {
		mutate({
			op: "bind:configuration-output",
			componentId: component.id,
			actionId: action.id,
			configurationId,
			sourceActionId,
			outputName,
		});
	};

	const onBindVariable = (configurationId: string, variableId: string) => {
		mutate({
			op: "bind:configuration-variable",
			componentId: component.id,
			actionId: action.id,
			configurationId,
			variableId,
		});
	};

	const onSetConfigurationCode = (configurationId: string, code: string) => {
		mutate({
			op: "bind:configuration-code",
			componentId: component.id,
			actionId: action.id,
			configurationId,
			code,
		});
	};

	// Same idea as the code editor: the draft is local while typing and only
	// reaches the workflow after a pause (or on blur/unmount) — one op per
	// keystroke would re-render the whole canvas.
	const flushNotes = () => {
		clearTimeout(notesTimerRef.current);
		const pending = pendingNotesRef.current;
		pendingNotesRef.current = null;
		if (pending === null || pending === (action.notes ?? "")) return;
		mutate({ op: "update:action-notes", componentId: component.id, actionId: action.id, notes: pending });
	};

	const onNotesChange = (next: string) => {
		setNotes(next);
		pendingNotesRef.current = next;
		clearTimeout(notesTimerRef.current);
		notesTimerRef.current = setTimeout(flushNotes, NOTES_COMMIT_DELAY_MS);
	};

	const flushNotesRef = useRef(flushNotes);
	flushNotesRef.current = flushNotes;
	useEffect(() => () => flushNotesRef.current(), []);

	// Switched off: the flow skips it and goes straight on to its Success output's next action.
	const disabled = !!action.disabled;
	const onToggleDisabled = () => {
		mutate({ op: "update:action-disabled", componentId: component.id, actionId: action.id, disabled: !disabled });
	};

	const onDeleteNode = () => {

		if (!workflow) return;

		const { workflow: updated } = new RemoveActionFromWorkflowComponent().execute(workflow.data, data.component.id, data.action.id);

		setWorkflow({ ...workflow, data: updated });
		setSelection(prev =>
			prev
				.map(selection =>
					selection.componentId === component.id
						? { ...selection, actionId: selection.actionId.filter(id => id !== action.id) }
						: selection
				)
				.filter(selection => selection.actionId.length > 0)
		);

	}

	// Tab switches change the node's height, which moves the bottom-pinned
	// fallback handle — xyflow has to re-measure or edges point at the old spot.
	const renderFields = (configurations: typeof visibleConfigurations, empty: string) =>
		board && configurations.length > 0
			? configurations.map(configuration => (
				<ConfigurationField
					key={configuration.id}
					configuration={configuration}
					component={component}
					board={board}
					actionId={action.id}
					connections={workflow?.data.connections ?? []}
					onChange={value => onChangeActionValue(configuration.id, value)}
					onBindOutput={(sourceActionId, outputName) => onBindOutput(configuration.id, sourceActionId, outputName)}
					onSetCode={code => onSetConfigurationCode(configuration.id, code)}
					variables={workflow?.data.variables ?? []}
					onBindVariable={variableId => onBindVariable(configuration.id, variableId)}
				/>
			))
			: <Text variant="low" size="xs">{empty}</Text>;

	useEffect(() => {
		updateNodeInternals(id);
	}, [id, tab, outputs.length]);

	return (

		// The node's box is just the card — the handles hang outside it (NodePorts).
		<div className={clsx("relative w-68", debugRootClass(debugMark))}>

			<DebugBadges mark={debugMark} />

			<NodePorts side="left">
				{inputs.map(input => (
					<NodePort key={input.id} id={input.id} type="target" label={input.base.name} />
				))}
			</NodePorts>

			<div
				className={
					clsx(
						"relative flex flex-col z-10 bg-raised border rounded-lg overflow-hidden w-full transition-[border-color,box-shadow,opacity] duration-150",
						debugCardClass(debugMark, selected),
						// Off: faded and dashed — still editable, back to full on hover.
						disabled && "border-dashed opacity-55 hover:opacity-100",
					)
				}
			>

				<div className="flex gap-2 items-center h-fit px-2 py-2">

					<ActionIcon icon={nodeIcon(component, action)} fallback={isLogicComponent(component) ? <LogicIcon action={action.base.displayName} /> : null} className="shrink-0 text-accent-fg" />
					<Text variant="high" font="mono" size="lg" className={clsx(disabled && "line-through decoration-fg-muted")}>{action.alias}</Text>
					<Text variant="low" size="sm">•</Text>
					<Text variant="low" size="sm">{component.alias}</Text>

					{disabled && (
						<span
							className="ml-auto flex items-center gap-1 rounded-sm border border-line bg-field px-1.5 h-5 text-xs text-fg-muted"
							title="Skipped when the flow runs — it goes straight on to the next action"
						>
							<EyeOff size={11} />
							Disabled
						</span>
					)}

				</div>


				<Tabs.Root value={tab} onValueChange={value => setTab(value as NodeTab)} className="border-b border-line-subtle">

					<Tabs.List className="nodrag gap-4 px-4 border-line-subtle">
						<Tabs.Tab value="configuration" className="pb-2">Configuration</Tabs.Tab>
						<Tabs.Tab value="advanced" className="pb-2">Advanced</Tabs.Tab>
						<Tabs.Tab value="notes" className="pb-2">Notes</Tabs.Tab>
					</Tabs.List>

					<Tabs.Panel value="configuration" className="flex flex-col gap-4 px-4 py-4 max-h-72 overflow-auto nowheel">
						{renderFields(basicConfigurations, "No configuration for this action.")}
						{workflow && isSwitchAction(workflow.data, action.id) && (
							<SwitchCasesField
								count={switchCaseCount(action)}
								onAdd={() => mutate({ op: "add:switch-case", componentId: component.id, actionId: action.id })}
								onRemove={n => mutate({ op: "remove:switch-case", componentId: component.id, actionId: action.id, case: n })}
							/>
						)}
					</Tabs.Panel>

					<Tabs.Panel value="advanced" className="flex flex-col gap-4 px-4 py-4 max-h-72 overflow-auto nowheel">
						{(advancedConfigurations.length > 0 || !canPassContext) && renderFields(advancedConfigurations, "No advanced options for this action.")}
						{canPassContext && (
							<PassContextField
								checked={passContext}
								onChange={checked => mutate({ op: "update:action-pass-context", componentId: component.id, actionId: action.id, passContext: checked })}
							/>
						)}
					</Tabs.Panel>

					<Tabs.Panel value="notes" className="nodrag nowheel px-4 py-4">
						<Textarea.Root value={notes}>
							<Textarea.Field
								rows={4}
								value={notes}
								onChange={e => onNotesChange(e.target.value)}
								onBlur={flushNotes}
								placeholder="Write a note about this action..."
							/>
						</Textarea.Root>
					</Tabs.Panel>

				</Tabs.Root>


				{
					(outputSchema.length > 0 || shown) &&
					<div className="flex flex-col border-b border-line-subtle">

						{shown && <RunSummary title={shown.title} output={shown.output} ranAt={shown.ranAt} onClose={shown.onClose} />}

						{outputSchema.map((output, i) => (
							<Fragment key={i}>
							<OutputRow actionId={action.id} outputName={output.name}>
								<div className="flex items-center justify-between gap-2 px-1 py-2">
									<div className="flex items-center gap-2">
										<GripVertical size={12} className="text-fg-muted shrink-0" />
										<Tooltip.Provider>
											<Tooltip.Root>
												<Tooltip.Trigger className="text-fg-secondary">
													<Info size={12} />
												</Tooltip.Trigger>
												<Tooltip.Content>
													{output.description && <Text variant="high" size="xs">{output.description}</Text>}
												</Tooltip.Content>
											</Tooltip.Root>

										</Tooltip.Provider>
										<Text variant="high" size="xs" font="mono" className="break-all">{output.name}</Text>
									</div>
									<Text variant="high" size="xs" font="mono" className="shrink-0" title={shapeLabel(output.type)}>{shortShapeLabel(output.type)}</Text>
								</div>
							</OutputRow>
							{hasShapeFields(output.type) && <ShapeTree shape={output.type} actionId={action.id} outputName={output.name} />}
							{valueOf(output.name) && (
								<OutputValue value={valueOf(output.name)!} onEdit={shown?.onEdit} busy={shown?.busy} source={{ actionId: action.id, outputName: output.name }} />
							)}
							</Fragment>
						))}

						{undeclared.map(value => (
							<OutputValue key={value.name} value={value} showName onEdit={shown?.onEdit} busy={shown?.busy} />
						))}

					</div>
				}


				{runner.error && (
					<div className="nodrag flex items-start gap-2 px-3 py-2 border-b border-line-subtle bg-field">
						<span className="mt-1 size-1.5 shrink-0 rounded-full bg-danger" />
						<Text variant="low" size="xs" className="text-danger! wrap-break-word flex-1 min-w-0">{runner.error}</Text>
						<button type="button" onClick={runner.clear} className="shrink-0 cursor-pointer text-fg-muted hover:text-fg" title="Dismiss">
							<X size={11} />
						</button>
					</div>
				)}

				<div className="flex gap-2 px-2 py-2">

					<Button.Root
						size="sm"
						variant="ghost"
						onClick={runner.run}
						disabled={!!runner.unavailable || runner.running || !!debug.session}
						title={debug.session ? "Stop debugging to run an action alone" : runner.unavailable ?? "Run this action alone on the board — outside the flow"}
					>
						<Button.Icon>
							{runner.running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
						</Button.Icon>
					</Button.Root>

					<Button.Root
						size="sm"
						variant="ghost"
						onClick={onToggleDisabled}
						title={disabled ? "Enable — run it again when the flow reaches it" : "Disable — the flow skips it and goes on to the next action"}
						aria-pressed={disabled}
						className={clsx(disabled && "text-accent-fg!")}
					>
						<Button.Icon>
							{disabled ? <Eye size={12} /> : <EyeOff size={12} />}
						</Button.Icon>
					</Button.Root>

					<Button.Root size="sm" variant="ghost" onClick={onDeleteNode}>
						<Button.Icon>
							<Trash size={12} />
						</Button.Icon>
					</Button.Root>

				</div>

			</div>

			<NodePorts side="right">
				{outputs.map(output => {
					const isFallback = output.base.id === "fallback";
					return (
						<NodePort
							key={output.id}
							id={output.id}
							type="source"
							label={portLabel(output.base.name, actionConfigurations)}
							tone={isFallback ? "danger" : "default"}
							active={shownOutput?.name === output.base.name}
							className={isFallback ? "mt-4" : undefined}
						/>
					);
				})}
			</NodePorts>

		</div>

	);
};
