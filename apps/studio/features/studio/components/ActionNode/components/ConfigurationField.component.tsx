import { useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { Badge, Button, Dropdown, Input, Select, Switch, Text, ToggleGroup, Tooltip } from "@henglosio/ui";
import { ConfigurationParser, contextSourcesOf, emptyShapeValue, outputReaches, isJsonShape, isShapeCompatible, isVariablesComponent, resolveWorkflowAction } from "@henglosio/workflow";
import type { IAnyValueKindSchema, IAnyValueSchema, IAssignmentCollectionValueSchema, IFilterValueSchema, IBoardRuntime, IComponentRuntime, IConfigurationRuntime, IConfigurationSchema, IConnectionRuntime, ICredentialValueSchema, IFileValueSchema, IOptionEntrySchema, IOptionValueSchema, IPinSchema, IShape, IVariableRuntime, IWorkflowRuntime } from "@henglosio/workflow";
import { FileField } from "./FileField.component";
import { CredentialField } from "./CredentialField.component";
import { OptionsField } from "./OptionsField.component";
import { AssignmentCollectionField, CollectionField, DateTimeField, FilterField, FixedCollectionField, JsonField, MultiOptionsField, NoticeField, TextValueField } from "./properties/PropertyEditors.component";
import { ShapeValueEditor } from "@/features/studio/components/ShapeEditor/ShapeValueEditor.component";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { Check, ChevronDown, CircleHelp, Code2, Info, Variable, X } from "lucide-react";
import clsx from "clsx";
import { useSyncedDraft } from "@/features/studio/lib/useSyncedDraft";
import { dragExpression, useBindDroppable } from "@/features/studio/lib/bindDrag";
import { shapeAtPath } from "./ShapeTree.component";
import { CodeEditorTargetAtom } from "@/features/studio/store/canvas.store";

// Configs a Code binding can target — the ones resolveExpectedType (in
// GenerateExecuteCommand.use-case.ts, packages/workflow) gives a RESULT TYPE:
// what the script returns is converted to the config's type on the board
// (integer, float, bool, string, bytes, list, object), or kept as it is for
// "any". Only "code" (the Monaco script field itself) is excluded: a script
// that computes the script to run doesn't mean anything. Offering the toggle
// on a type resolveExpectedType doesn't cover would let the user write a
// script that silently gets dropped at compile time.
const CODE_ELIGIBLE_TYPES: ReadonlySet<IConfigurationSchema["type"]> = new Set([
	"toggle", "integer", "float", "pin", "any", "string", "password", "options", "bytes", "color", "dateTime",
	// A script returning a list / a dict — sent as its JSON.
	"list", "object", "json", "multiOptions", "collection", "fixedCollection", "filter", "assignmentCollection",
]);

// Types made of fields of their own (a filter's conditions, a collection's
// fields): what's dropped goes to the field under the pointer, never binds the
// whole of it — a script can, through Fixed | Python.
const HOLDS_FIELDS: ReadonlySet<IConfigurationSchema["type"]> = new Set(["filter", "collection", "fixedCollection", "assignmentCollection"]);

// n8n's types whose value is a list or an object (JSON on the board): bound as
// a whole, to whatever list or object an output, a variable or a script holds.
const JSON_VALUE_TYPES: ReadonlySet<IConfigurationSchema["type"]> = new Set([
	"json", "multiOptions", "collection", "fixedCollection", "filter", "assignmentCollection",
]);

/** The shape a list / object config holds — null for the other types. */
const configShape = (base: IConfigurationSchema): IShape | null =>
	base.type === "list" ? { list: base.items }
	: base.type === "object" ? { object: Object.fromEntries(base.fields.map(field => [field.name, field.type])) }
	: null;

/** The declared type of an action's output, when it declares one. */
const outputTypeOf = (workflow: IWorkflowRuntime | undefined, actionId: string, outputName: string) =>
	workflow ? resolveWorkflowAction(workflow, actionId)?.action.base.outputSchema
		?.find(output => output.name.toLowerCase() === outputName.toLowerCase())?.type : undefined;

type ConfigurationFieldProps = {
	configuration: IConfigurationRuntime;
	component: IComponentRuntime;
	board: IBoardRuntime;
	actionId: string;
	connections: IConnectionRuntime[];
	onChange: (value: IConfigurationRuntime["value"]) => void;
	onBindOutput?: (sourceActionId: string, outputName: string) => void;
	onSetCode?: (code: string) => void;
	/** The workflow's variables — for variable bindings and "variable" configs. */
	variables?: IVariableRuntime[];
	onBindVariable?: (variableId: string) => void;
	/**
	 * No label: the field alone, filling its row — for fields laid out side by
	 * side (Switch's cases). Its description shows on hover; "Define with
	 * Python" moves to a button after the field.
	 */
	compact?: boolean;
};

export const ConfigurationField: React.FC<ConfigurationFieldProps> = ({ configuration, component, board, actionId, onChange, onBindOutput, onSetCode, variables = [], onBindVariable, compact = false }) => {

	const { base, value, binding } = configuration;
	const [draft, setDraft] = useSyncedDraft(value, v => v);
	const workflowData = useAtomValue(WorkflowAtom)?.data;
	// A list / object config takes only a list / object of a shape that fits;
	// an "any" one (Variables' Set / Append / Set Field Value) takes anything;
	// any other plain one never takes a list or an object.
	const targetShape = configShape(base);
	const isShapeAllowed = (source: IShape | "any" | string[] | undefined) =>
		targetShape ? source === undefined || isShapeCompatible(source as IShape, targetShape)
		: base.type === "any" || JSON_VALUE_TYPES.has(base.type) || !isJsonShape(source);
	const [codeEditorTarget, setCodeEditorTarget] = useAtom(CodeEditorTargetAtom);
	// Why the typed value doesn't pass the config's filters (patterns), if it doesn't.
	const [filterError, setFilterError] = useState<string | null>(null);

	// A value changed from elsewhere (collab, undo) replaces the draft — and its error.
	useEffect(() => setFilterError(null), [value]);

	// The actions whose outputs reach this one — right before it, or further
	// back through actions that pass their context on (Pass Context).
	const sources = useMemo(() => workflowData ? contextSourcesOf(workflowData, actionId) : null, [workflowData, actionId]);
	const reaches = (sourceActionId: string) => !sources || sources.has(sourceActionId);

	// An output binding goes by the output's name: broken once no action whose
	// data reaches this one publishes it (removed, rewired, an action in
	// between not passing its context on) — not because the action it was
	// dragged from is gone: another one publishing that name keeps it working.
	const isBindingBroken = !!binding && "outputName" in binding && !!workflowData && !outputReaches(workflowData, actionId, binding.outputName);

	// Any config can read a variable — except Set's own "which variable" and a
	// script field (a variable holding the source to run means nothing).
	const canBindVariable = !!onBindVariable && base.type !== "variable" && base.type !== "code" && base.type !== "file" && base.type !== "credential";

	// Variables' Set: its Value is typed in as the variable it writes is — an
	// integer variable takes a number, a list one a list. Undefined anywhere
	// else, or before a variable is picked: the kind is the user's to choose.
	const setVariableType = useMemo(() => {
		if (!workflowData || !isVariablesComponent(component) || base.type !== "any" || base.displayName !== "Value") return undefined;
		const resolved = resolveWorkflowAction(workflowData, actionId);
		if (resolved?.action.base.displayName !== "Set") return undefined;
		const variableId = resolved.configurations.find(config => config.base.type === "variable")?.value;
		return variables.find(variable => variable.id === variableId)?.type;
	}, [workflowData, component, base, actionId, variables]);

	// A variable fits when it's bindable here and its shape fits the config's.
	const variableFits = (variableId: string) => {
		const variable = variables.find(found => found.id === variableId);
		return canBindVariable && (!variable || isShapeAllowed(variable.shape));
	};

	// An output is legal to bind here when its data reaches this action (see
	// sources) and its type fits.
	const outputFits = (sourceActionId: string, outputName: string) =>
		!!onBindOutput && reaches(sourceActionId)
		&& isShapeAllowed(outputTypeOf(workflowData, sourceActionId, outputName));

	// A field of a list / object output becomes a Code binding reading it — so
	// the config has to take code, the output come from upstream, and the
	// field's type fit.
	const fieldFits = (sourceActionId: string, outputName: string, path: (string | number)[]) =>
		!!onSetCode && CODE_ELIGIBLE_TYPES.has(base.type) && reaches(sourceActionId)
		&& isShapeAllowed(shapeAtPath(outputTypeOf(workflowData, sourceActionId, outputName), path));

	// An attached file, a picked credential: the value itself — nothing binds to them.
	const drop = useBindDroppable(`config:${actionId}:${configuration.id}`, {
		accepts: drag =>
			base.type === "file" || base.type === "credential" ? "deny"
			// Fields inside take a drop (a condition's value — a pill), not the whole of it.
			: HOLDS_FIELDS.has(base.type) ? null
			: drag.kind === "variable" ? (variableFits(drag.variableId) ? "ok" : "deny")
			: drag.kind === "field" ? (fieldFits(drag.actionId, drag.outputName, drag.path) ? "ok" : "deny")
			: !onBindOutput ? null
			: outputFits(drag.actionId, drag.outputName) ? "ok" : "deny",
		onDrop: drag => {
			if (drag.kind === "variable") onBindVariable!(drag.variableId);
			else if (drag.kind === "field") onSetCode!(`return ${dragExpression(drag)}`);
			else onBindOutput!(drag.actionId, drag.outputName);
		},
	});

	const dragRing = drop.state === "ok" ? "ring-1 ring-accent" : drop.state === "deny" ? "ring-1 ring-danger" : undefined;

	const dropTarget = { ref: drop.setNodeRef };

	// n8n's notice: a note in the node — no value, nothing to bind.
	if (base.type === "notice") return <NoticeField text={base.displayName} tone={base.tone} />;

	if (binding && "code" in binding) {

		const isOpen = codeEditorTarget?.actionId === actionId && codeEditorTarget?.configurationId === configuration.id;
		const trimmed = binding.code.trim();
		const preview = trimmed.length > 0 ? trimmed.split("\n")[0]!.slice(0, 40) : "Vazio — clique para escrever";

		const openEditor = () => setCodeEditorTarget({
			actionId,
			configurationId: configuration.id,
			displayName: base.displayName,
			language: "python",
			value: binding.code,
			onChange: code => onSetCode?.(code),
			kind: "binding",
		});

		return (
			<div className={clsx("flex flex-col gap-1.5 nodrag w-full min-w-0", !compact && "group/param")}>
				{!compact && <FieldLabel base={base} mode="code" onCode={openEditor} onFixed={() => onChange(undefined)} />}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={openEditor}
						className={clsx(
							// Same box as Input.Root, so it lines up with the other fields.
							"nodrag flex-1 min-w-0 flex items-center gap-2 h-8 px-2 rounded-md border text-left cursor-pointer",
							"border-line bg-field hover:bg-field-hover transition-colors",
							isOpen && "ring-1 ring-accent",
						)}
					>
						<Code2 size={12} className="text-accent-fg shrink-0" />
						<Text variant="dim" size="xs" font="mono" className="truncate">{preview}</Text>
					</button>
					<Button.Root variant="ghost" className={compact ? "size-6 p-0! justify-center shrink-0" : "p-2!"} onClick={() => onChange(undefined)} title="Unbind">
						<Button.Icon>
							<X size={12} />
						</Button.Icon>
					</Button.Root>
				</div>
			</div>
		);

	}

	if (binding && "variableId" in binding) {

		const variable = variables.find(v => v.id === binding.variableId);

		return (
			<div className={clsx("flex flex-col gap-1.5 nodrag w-full min-w-0", !compact && "group/param")} {...dropTarget}>
				{!compact && <FieldLabel base={base} />}
				<div className="flex items-center gap-2">
					<Badge
						variant={variable ? "default" : "error"}
						className={clsx("flex-1 min-w-0 h-8", !variable && "ring-1 ring-danger", dragRing)}
					>
						<span className="flex items-center gap-1 font-mono">
							<Variable size={11} className="shrink-0" />
							{variable ? variable.name : "removed variable"}
						</span>
					</Badge>
					<Button.Root variant="ghost" className={compact ? "size-6 p-0! justify-center shrink-0" : "p-2!"} onClick={() => onChange(undefined)} title="Unbind">
						<Button.Icon>
							<X size={12} />
						</Button.Icon>
					</Button.Root>
				</div>
			</div>
		);

	}

	if (binding) {

		const isOutputBinding = "outputName" in binding;

		return (
			<div className={clsx("flex flex-col gap-1.5 nodrag w-full min-w-0", !compact && "group/param")} {...dropTarget}>
				{!compact && <FieldLabel base={base} />}
				<div className="flex items-center gap-2">
					<Badge
						variant={isBindingBroken ? "error" : "default"}
						className={clsx(
							"flex-1 min-w-0 h-8",
							isBindingBroken && "ring-1 ring-danger",
							dragRing,
						)}
					>
						{isOutputBinding
							? binding.outputName
							: binding.configurationName
						}
					</Badge>
					<Button.Root variant="ghost" className={compact ? "size-6 p-0! justify-center shrink-0" : "p-2!"} onClick={() => onChange(undefined)} title="Unbind">
						<Button.Icon>
							<X size={12} />
						</Button.Icon>
					</Button.Root>
				</div>
			</div>
		);

	}

	const commit = (next: IConfigurationRuntime["value"]) => {
		setDraft(next);
		setFilterError(null);
		onChange(next);
	};

	// Text fields go through the manifest's `patterns` filters before they
	// commit: a value that fails one keeps the draft (so it can be fixed) and
	// shows why under the field, instead of being silently dropped.
	const commitChecked = (next: string | undefined) => {
		if (next === undefined || next === "") return commit(base.type === "integer" || base.type === "float" ? undefined : next);
		const problem = ConfigurationParser.validate(base, next);
		if (problem) return setFilterError(problem);
		commit(next);
	};

	// Once an error shows, re-check as the user types so it clears as soon as the value is fixed.
	const editDraft = (next: string | undefined) => {
		setDraft(next);
		if (filterError) setFilterError(next ? ConfigurationParser.validate(base, next) : null);
	};

	// Switches this field from a literal into a Code binding (empty script,
	// editor opens immediately) — see the `binding && "code" in binding` branch
	// above for what it renders once there. Only offered where onSetCode was
	// passed down (ActionNode wires it) and the field's type actually has a
	// representable RESULT TYPE to coerce a Python result into (CODE_ELIGIBLE_TYPES).
	const openCodeMode = () => {
		onSetCode?.("");
		setCodeEditorTarget({
			actionId,
			configurationId: configuration.id,
			displayName: base.displayName,
			language: "python",
			value: "",
			onChange: code => onSetCode?.(code),
			kind: "binding",
		});
	};

	return (

		<div
			className={clsx(
				"flex gap-2 nodrag rounded-sm transition-shadow",
				compact ? "flex-row items-center w-full min-w-0" : "group/param flex-col w-full gap-1.5",
			)}
			{...dropTarget}
		>

			{!compact && (
				<FieldLabel
					base={base}
					mode="fixed"
					onCode={onSetCode && CODE_ELIGIBLE_TYPES.has(base.type) ? openCodeMode : undefined}
				/>
			)}

			<div className={clsx(dragRing, dragRing && "rounded-md", compact && "flex-1 min-w-0 [&>*]:w-full")}>

				{base.type === "string" && (base.rows ?? 1) > 1 && (
					<TextValueField value={draft as string | undefined} onChange={next => commitChecked(next)} placeholder={base.placeholder} rows={base.rows} />
				)}

				{base.type === "string" && (base.rows ?? 1) <= 1 && (
					<Input.Root className={clsx("nodrag", filterError && "ring-1 ring-danger rounded-md")} value={draft as string ?? ""}>
						<Input.Field
							placeholder={base.placeholder}
							value={draft as string ?? ""}
							onChange={e => editDraft(e.target.value)}
							onBlur={() => commitChecked(draft as string | undefined)}
						/>
					</Input.Root>
				)}

				{base.type === "password" && (
					<Input.Root className={clsx("nodrag", filterError && "ring-1 ring-danger rounded-md")} value={draft as string ?? ""}>
						<Input.Field
							type="password"
							placeholder={base.placeholder}
							value={draft as string ?? ""}
							onChange={e => editDraft(e.target.value)}
							onBlur={() => commitChecked(draft as string | undefined)}
						/>
					</Input.Root>
				)}

				{(base.type === "integer" || base.type === "float") && (
					<Input.Root className={clsx("nodrag", filterError && "ring-1 ring-danger rounded-md")} value={draft as string ?? ""}>
						<Tooltip.Provider delayDuration={600}>
							<Tooltip.Root>
								<Tooltip.Trigger asChild>
									<Input.Handler
										className="border-r border-line"
										onScrubEnd={scrubbed => commitChecked(String(scrubbed))}
									/>
								</Tooltip.Trigger>
								<Tooltip.Content side="top">
									<Text variant="high" size="xs">Drag to adjust · Shift ×10 · Alt ×0.1</Text>
								</Tooltip.Content>
							</Tooltip.Root>
						</Tooltip.Provider>
						<Input.Field
							type="text"
							placeholder={base.placeholder}
							value={draft as string ?? ""}
							onChange={e => editDraft(e.target.value === "" ? undefined : e.target.value)}
							onBlur={() => commitChecked(draft as string | undefined)}
						/>
					</Input.Root>
				)}

				{base.type === "toggle" && (
					<div className="flex items-center gap-2 h-8">
						<Switch.Root
							className={"nodrag"}
							checked={Boolean(draft)}
							onCheckedChange={checked => commit(checked)}
						/>
						{base.label && <Text variant="dim" size="xs">{base.label}</Text>}
					</div>
				)}

				{base.type === "color" && (
					<Input.Root className={"nodrag"} value={draft as string ?? ""}>
						<Input.Prefix className="p-2!">
							<input
								type="color"
								value={draft as string || "#000000"}
								onChange={e => commit(e.target.value)}
								className="size-4 rounded-xs border-none cursor-pointer bg-transparent"
							/>
						</Input.Prefix>
						<Input.Field
							value={draft as string ?? ""}
							placeholder="#000000"
							onChange={e => setDraft(e.target.value)}
							onBlur={() => commit(draft)}
						/>
					</Input.Root>
				)}

				{base.type === "code" && (
					<CodeField
						value={draft as string ?? ""}
						language={base.language ?? "plaintext"}
						displayName={base.displayName}
						isOpen={codeEditorTarget?.actionId === actionId && codeEditorTarget?.configurationId === configuration.id}
						onOpen={() => setCodeEditorTarget({
							actionId,
							configurationId: configuration.id,
							displayName: base.displayName,
							language: base.language ?? "plaintext",
							value: (draft as string) ?? "",
							onChange: commit,
							kind: "script",
						})}
					/>
				)}

				{base.type === "options" && (
					<OptionsField
						value={draft as string | undefined}
						options={base.options}
						onChange={commit}
						className="w-full"
					/>
				)}

				{base.type === "any" && (
					<AnyField
						value={draft as IAnyValueSchema | undefined}
						availables={base.availables}
						{...(setVariableType ? { kind: setVariableType } : {})}
						onChange={commit}
					/>
				)}

				{base.type === "pin" && (
					<PinField
						value={draft as IPinSchema | undefined}
						from={base.from}
						filterBy={base.filterBy}
						component={component}
						board={board}
						onChange={commit}
					/>
				)}

				{base.type === "variable" && (
					<VariableField
						value={draft as string | undefined}
						variables={variables}
						onChange={commit}
					/>
				)}

				{base.type === "bytes" && (
					<Text variant="dim" size="xs">Set by a binding or a script — not editable by hand</Text>
				)}

				{base.type === "file" && (
					<FileField base={base} value={draft as IFileValueSchema | undefined} onChange={commit} />
				)}

				{base.type === "credential" && (
					<CredentialField base={base} value={draft as ICredentialValueSchema | undefined} onChange={commit} />
				)}

				{base.type === "dateTime" && (
					<DateTimeField value={draft as string | undefined} onChange={commit} />
				)}

				{base.type === "json" && (
					<div className="w-full"><JsonField value={draft as string | undefined} onChange={commit} rows={base.rows} /></div>
				)}

				{base.type === "multiOptions" && (
					<div className="w-full"><MultiOptionsField value={draft as string[] | undefined} options={base.options} onChange={commit} /></div>
				)}

				{base.type === "collection" && (
					<div className="w-full"><CollectionField property={base} value={draft as Record<string, unknown> | undefined} onChange={commit} /></div>
				)}

				{base.type === "fixedCollection" && (
					<div className="w-full"><FixedCollectionField property={base} value={draft as Record<string, unknown> | undefined} onChange={commit} /></div>
				)}

				{base.type === "filter" && (
					<div className="w-full"><FilterField value={draft as IFilterValueSchema | undefined} onChange={commit} /></div>
				)}

				{base.type === "assignmentCollection" && (
					<div className="w-full"><AssignmentCollectionField value={draft as IAssignmentCollectionValueSchema | undefined} onChange={commit} /></div>
				)}

				{(base.type === "list" || base.type === "object") && targetShape && (
					<div className="w-full">
						<ShapeValueEditor
							shape={targetShape}
							value={draft ?? base.defaultValue ?? emptyShapeValue(targetShape)}
							onChange={next => commit(next as IConfigurationRuntime["value"])}
							maxItems={base.type === "list" ? base.maxItems : undefined}
							labels={base.type === "object" ? Object.fromEntries(base.fields.map(field => [field.name, field.displayName])) : undefined}
						/>
					</div>
				)}

			</div>

			{/* Compact: a slot as wide as Unbind's on a bound field, empty when it takes no code — every field ends at the same place. */}
			{compact && (
				<span className="nodrag flex items-center justify-center size-6 shrink-0">
					{onSetCode && CODE_ELIGIBLE_TYPES.has(base.type) && (
						<button
							type="button"
							onClick={openCodeMode}
							className="flex items-center justify-center size-6 rounded-sm text-fg-secondary hover:text-accent-fg hover:bg-hover cursor-pointer"
							title="Define with Python"
						>
							<Code2 size={12} />
						</button>
					)}
				</span>
			)}

			{filterError && (
				<Text variant="low" size="xs" className="text-danger!">{filterError}</Text>
			)}

			{/* n8n's parameter hint: a line under the field. */}
			{!compact && base.hint && (
				<Text variant="low" size="xs">{base.hint}</Text>
			)}


		</div>
	);

}

type FieldLabelProps = {
	base: IConfigurationRuntime["base"];
	/** Typed in ("fixed"), or computed by Python ("code"). */
	mode?: "fixed" | "code";
	// Fixed | Python, at the end of the label row — only for a type in
	// CODE_ELIGIBLE_TYPES with onSetCode wired in.
	onCode?: () => void;
	onFixed?: () => void;
};

const FieldLabel: React.FC<FieldLabelProps> = ({ base, mode = "fixed", onCode, onFixed }) => (
	<div className="flex items-center gap-1.5 min-h-6">
		<Text variant="high" size="xs" className="font-medium truncate">{base.displayName}</Text>
		{base.required && <span className="text-xs leading-4 text-danger">*</span>}
		{base.description?.trim() && (
			// Its description, n8n's way: a (?) that shows on hover.
			<Tooltip.Provider delayDuration={200}>
				<Tooltip.Root>
					<Tooltip.Trigger asChild>
						<span className="nodrag flex items-center text-fg-muted hover:text-fg cursor-help opacity-0 group-hover/param:opacity-100 transition-opacity">
							<CircleHelp size={12} />
						</span>
					</Tooltip.Trigger>
					<Tooltip.Content side="top" align="start">
						<Text variant="high" size="xs" className="whitespace-normal max-w-72">{base.description}</Text>
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
		)}
		{(onCode || onFixed) && (
			// n8n's Fixed | Expression: a typed-in value, or Python that computes it on the board.
			<ToggleGroup.Root
				size="sm"
				value={mode}
				onValueChange={next => next === "code" ? onCode?.() : onFixed?.()}
				className={clsx("nodrag ml-auto transition-opacity", mode === "code" ? "opacity-100" : "opacity-0 group-hover/param:opacity-100 focus-within:opacity-100")}
			>
				<ToggleGroup.Item value="fixed" className="h-5! px-1.5! text-[10px]!">Fixed</ToggleGroup.Item>
				<ToggleGroup.Item value="code" className="h-5! px-1.5! text-[10px]!">Python</ToggleGroup.Item>
			</ToggleGroup.Root>
		)}
	</div>
);

type CodeFieldProps = {
	value: string;
	language: string;
	displayName: string;
	isOpen: boolean;
	onOpen: () => void;
};

// Edits nothing here — it's only the "trigger" that opens Monaco in the
// secondary sidebar (see CodeEditorTargetAtom/CodeEditor.feature.tsx). The node
// stays small on purpose; actually writing/reading the script needs more room
// than a configuration card has.
const CodeField: React.FC<CodeFieldProps> = ({ value, isOpen, onOpen }) => {

	const trimmed = value.trim();
	const preview = trimmed.length > 0 ? trimmed.split("\n")[0]!.slice(0, 40) : "Vazio — clique para escrever";

	return (
		<button
			type="button"
			onClick={onOpen}
			className={clsx(
				"nodrag flex items-center gap-2 w-full min-w-0 h-8 px-2 rounded-md border text-left cursor-pointer",
				"border-line bg-field hover:bg-field-hover transition-colors",
				isOpen && "ring-1 ring-accent",
			)}
		>
			<Code2 size={12} className="text-fg-secondary shrink-0" />
			<Text variant="dim" size="xs" font="mono" className="truncate">
				{preview}
			</Text>
		</button>
	);

};

// An integer takes a whole number, a float a fractional part too — both may be negative.
const ANY_KIND_PATTERNS: Record<"integer" | "float", RegExp> = {
	integer: /^-?\d+$/,
	float: /^-?\d+(\.\d+)?$/,
};

// A list / an object typed in: of anything (what a dynamic variable holds).
const ANY_LIST_SHAPE: IShape = { list: "any" };
const ANY_OBJECT_SHAPE: IShape = { object: {} };

/** What a value of `kind` starts as, when the kind is picked. */
const emptyAnyValue = (kind: IAnyValueKindSchema): IAnyValueSchema["value"] => {
	switch (kind) {
		case "integer":
		case "float": return 0;
		case "bool": return false;
		case "string": return "";
		case "list": return [];
		case "object": return {};
	}
};

const anyText = (value: IAnyValueSchema | undefined) =>
	value && (typeof value.value === "number" || typeof value.value === "boolean" || typeof value.value === "string") ? String(value.value) : "";

type AnyFieldProps = {
	value: IAnyValueSchema | undefined;
	availables: IAnyValueKindSchema[];
	/** The kind it takes, set from outside (Set's Value: its variable's type) — no picker then. */
	kind?: IAnyValueKindSchema;
	onChange: (value: IAnyValueSchema) => void;
};

const AnyField: React.FC<AnyFieldProps> = ({ value, availables, kind: fixedKind, onChange }) => {

	const kind = fixedKind ?? value?.kind ?? availables[0]!;
	// The value held, when it's of the kind shown — a variable whose type changed leaves an old one.
	const current = value?.kind === kind ? value : undefined;
	const [draft, setDraft] = useSyncedDraft(current, anyText);

	const commitText = () => {

		const revert = () => setDraft(anyText(current));

		if (kind === "string") return draft === anyText(current) ? undefined : onChange({ kind, value: draft });

		if (kind === "bool") {
			const normalized = draft.trim().toLowerCase();
			if (["true", "1", "yes", "on"].includes(normalized)) return onChange({ kind, value: true });
			if (["false", "0", "no", "off"].includes(normalized)) return onChange({ kind, value: false });
			return revert();
		}

		if (kind === "integer" || kind === "float") {
			const trimmed = draft.trim();
			if (!ANY_KIND_PATTERNS[kind].test(trimmed)) return revert();
			return onChange({ kind, value: Number(trimmed) });
		}

	};

	const changeKind = (nextKind: string) => {
		const next = emptyAnyValue(nextKind as IAnyValueKindSchema);
		setDraft(typeof next === "object" ? "" : String(next));
		onChange({ kind: nextKind as IAnyValueKindSchema, value: next });
	};

	const picker = !fixedKind && availables.length > 1 && (
		<Input.Select value={kind} onValueChange={changeKind}>
			{availables.map(available => (
				<Select.Item key={available} value={available}>
					{available}
				</Select.Item>
			))}
		</Input.Select>
	);

	if (kind === "list" || kind === "object") {
		const shape = kind === "list" ? ANY_LIST_SHAPE : ANY_OBJECT_SHAPE;
		return (
			<div className="nodrag flex flex-col gap-1 min-w-56">
				{picker && (
					<Select.Root value={kind} onValueChange={changeKind} className="w-36">
						<Select.Trigger />
						<Select.Content>
							{availables.map(available => (
								<Select.Item key={available} value={available}>{available}</Select.Item>
							))}
						</Select.Content>
					</Select.Root>
				)}
				<ShapeValueEditor
					shape={shape}
					value={current?.value ?? emptyAnyValue(kind)}
					onChange={next => onChange({ kind, value: (next ?? emptyAnyValue(kind)) as IAnyValueSchema["value"] })}
				/>
			</div>
		);
	}

	return (
		<Input.Root className="nodrag w-full!">

			<Input.Field
				placeholder={kind === "bool" ? "true / false" : kind === "string" ? "text" : "0"}
				value={draft}
				onChange={e => setDraft(e.target.value)}
				onBlur={commitText}
			/>

			{picker}

		</Input.Root>
	);

};

type PinFieldProps = {
	value: IPinSchema | undefined;
	from: "component" | "board";
	filterBy?: IPinSchema["type"];
	component: IComponentRuntime;
	board: IBoardRuntime;
	onChange: (pin: IPinSchema) => void;
};

const PinField: React.FC<PinFieldProps> = ({ value, from, filterBy, component, board, onChange }) => {

	const available = (from === "board" ? board.base.pins : (component.base.pins ? [component.base.pins] : []))
		.filter(pin => !filterBy || filterBy.every(capability => pin.type.includes(capability)));

	const [draft, setDraft] = useSyncedDraft(value, v => (v?.gpio !== undefined ? String(v.gpio) : ""));

	const commitGpio = () => {
		const gpio = Number(draft);
		if (!Number.isFinite(gpio) || draft.trim() === "") return;
		onChange({ gpio, type: filterBy ?? value?.type ?? [], displayName: `GPIO${gpio}` });
	};

	const selectPin = (pin: IPinSchema) => {
		setDraft(String(pin.gpio));
		onChange(pin);
	};

	return (
		<div className="flex items-center gap-2 w-full">

			<Input.Root value={draft} className="nodrag flex-1">
				<Input.Prefix>GPIO</Input.Prefix>
				<Input.Field
					type="text"
					value={draft}
					onChange={e => setDraft(e.target.value)}
					onBlur={commitGpio}
				/>
				<Dropdown.Root>
					<Dropdown.Trigger asChild>
						<button
							type="button"
							className="shrink-0 h-full px-2 flex items-center justify-center border-l border-line text-fg-muted hover:text-fg cursor-pointer"
						>
							<ChevronDown size={14} />
						</button>
					</Dropdown.Trigger>
					<Dropdown.Content align="end">
						{available.length === 0 && (
							<Dropdown.Item disabled>No pins available</Dropdown.Item>
						)}
						{available.map(pin => (
							<Dropdown.Item key={pin.gpio} onSelect={() => selectPin(pin)}>
								{pin.displayName ?? `GPIO ${pin.gpio}`}
							</Dropdown.Item>
						))}
					</Dropdown.Content>
				</Dropdown.Root>
			</Input.Root>

		</div>
	);

}

type VariableFieldProps = {
	value: string | undefined;
	variables: IVariableRuntime[];
	onChange: (variableId: string) => void;
};

// Picks which workflow variable — Variables / Set's target. Variables are
// created in the Variables list (under Components), not here.
const VariableField: React.FC<VariableFieldProps> = ({ value, variables, onChange }) => {

	const selected = variables.find(variable => variable.id === value);
	const missing = value !== undefined && value !== "" && !selected;

	return (
		<Dropdown.Root>
			<Dropdown.Trigger asChild>
				<button
					type="button"
					className={clsx(
						"nodrag flex items-center gap-2 w-full h-8 px-2 rounded-md border text-left cursor-pointer",
						"bg-field hover:bg-field-hover transition-colors",
						missing ? "border-danger" : "border-line",
					)}
				>
					<Variable size={12} className={clsx("shrink-0", selected ? "text-accent-fg" : "text-fg-muted")} />
					<Text variant={selected ? "high" : "low"} size="xs" font="mono" className="truncate flex-1">
						{selected ? selected.name : missing ? "removed variable" : "Pick a variable"}
					</Text>
					<ChevronDown size={14} className="shrink-0 text-fg-muted" />
				</button>
			</Dropdown.Trigger>
			<Dropdown.Content align="start">
				{variables.length === 0 && (
					<Dropdown.Item disabled>No variables — create one under Components</Dropdown.Item>
				)}
				{variables.map(variable => (
					<Dropdown.Item key={variable.id} onSelect={() => onChange(variable.id)}>
						<span className="font-mono">{variable.name}</span>
					</Dropdown.Item>
				))}
			</Dropdown.Content>
		</Dropdown.Root>
	);

};
