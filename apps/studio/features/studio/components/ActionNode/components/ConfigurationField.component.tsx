import { Fragment, useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { Badge, Button, Dropdown, Input, Select, Switch, Text, Tooltip } from "@henglosio/ui";
import { ConfigurationParser, contextSourcesOf, emptyShapeValue, outputReaches, isJsonShape, isShapeCompatible, resolveWorkflowAction } from "@henglosio/workflow";
import type { IAnyValueKindSchema, IAnyValueSchema, IBoardRuntime, IComponentRuntime, IConfigurationRuntime, IConfigurationSchema, IConnectionRuntime, ICredentialValueSchema, IFileValueSchema, IOptionEntrySchema, IOptionValueSchema, IPinSchema, IShape, IVariableRuntime, IWorkflowRuntime } from "@henglosio/workflow";
import { FileField } from "./FileField.component";
import { CredentialField } from "./CredentialField.component";
import { ShapeValueEditor } from "@/features/studio/components/ShapeEditor/ShapeValueEditor.component";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { ChevronDown, Code2, Info, Variable, X } from "lucide-react";
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
	"toggle", "integer", "float", "pin", "any", "string", "password", "options", "bytes", "color",
	// A script returning a list / a dict — sent as its JSON.
	"list", "object",
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
};

export const ConfigurationField: React.FC<ConfigurationFieldProps> = ({ configuration, component, board, actionId, onChange, onBindOutput, onSetCode, variables = [], onBindVariable }) => {

	const { base, value, binding } = configuration;
	const [draft, setDraft] = useSyncedDraft(value, v => v);
	const workflowData = useAtomValue(WorkflowAtom)?.data;
	// A list / object config takes only a list / object of a shape that fits;
	// an "any" one (Variables' Set / Append / Set Field Value) takes anything;
	// any other plain one never takes a list or an object.
	const targetShape = configShape(base);
	const isShapeAllowed = (source: IShape | "any" | string[] | undefined) =>
		targetShape ? source === undefined || isShapeCompatible(source as IShape, targetShape)
		: base.type === "any" || !isJsonShape(source);
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
			<div className="flex flex-col gap-2 nodrag">
				<FieldLabel base={base} />
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
					<Button.Root variant="ghost" className="p-2!" onClick={() => onChange(undefined)}>
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
			<div className="flex flex-col gap-2 nodrag" {...dropTarget}>
				<FieldLabel base={base} />
				<div className="flex items-center gap-2">
					<Badge
						variant={variable ? "default" : "error"}
						className={clsx("w-fit", !variable && "ring-1 ring-danger", dragRing)}
					>
						<span className="flex items-center gap-1 font-mono">
							<Variable size={11} className="shrink-0" />
							{variable ? variable.name : "removed variable"}
						</span>
					</Badge>
					<Button.Root variant="ghost" className="p-2!" onClick={() => onChange(undefined)}>
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
			<div className="flex flex-col gap-2 nodrag" {...dropTarget}>
				<FieldLabel base={base} />
				<div className="flex items-center gap-2">
					<Badge
						variant={isBindingBroken ? "error" : "default"}
						className={clsx(
							"w-fit",
							isBindingBroken && "ring-1 ring-danger",
							dragRing,
						)}
					>
						{isOutputBinding
							? binding.outputName
							: binding.configurationName
						}
					</Badge>
					<Button.Root variant="ghost" className="p-2!" onClick={() => onChange(undefined)}>
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
				"flex flex-col gap-2 w-fit nodrag rounded-sm transition-shadow",
			)}
			{...dropTarget}
		>

			<FieldLabel
				base={base}
				onEnableCode={onSetCode && CODE_ELIGIBLE_TYPES.has(base.type) ? openCodeMode : undefined}
			/>

			<div className={clsx(dragRing, dragRing && "rounded-md")}>

				{base.type === "string" && (
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
					/>
				)}

				{base.type === "any" && (
					<AnyField
						value={draft as IAnyValueSchema | undefined}
						availables={base.availables}
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

				{(base.type === "list" || base.type === "object") && targetShape && (
					<div className="w-64">
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

			{filterError && (
				<Text variant="low" size="xs" className="text-danger! max-w-56">{filterError}</Text>
			)}


		</div>
	);

}

type FieldLabelProps = {
	base: IConfigurationRuntime["base"];
	// Present only for a type in CODE_ELIGIBLE_TYPES with onSetCode wired in —
	// renders the small "switch to Python" trigger at the end of the label row.
	onEnableCode?: () => void;
};

const FieldLabel: React.FC<FieldLabelProps> = ({ base, onEnableCode }) => (
	<div className="flex items-center gap-2">
		{base.description?.trim() ? (
			// Its description, on hover — the name or the ⓘ after it.
			<Tooltip.Provider delayDuration={300}>
				<Tooltip.Root>
					<Tooltip.Trigger asChild>
						<span className="nodrag group/label inline-flex items-center gap-1 min-w-0 cursor-help">
							<Text variant="dim" size="xs" className="truncate">{base.displayName}</Text>
							<Info size={10} className="shrink-0 text-fg-muted opacity-60 group-hover/label:opacity-100 group-hover/label:text-accent-fg transition-opacity" />
						</span>
					</Tooltip.Trigger>
					<Tooltip.Content side="top" align="start">
						<Text variant="high" size="xs" className="whitespace-normal">{base.description}</Text>
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
		) : (
			<Text variant="dim" size="xs">{base.displayName}</Text>
		)}
		{base.required && <Text variant="accent" size="xs">*</Text>}
		{onEnableCode && (
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger
						onClick={onEnableCode}
						className="nodrag ml-auto text-fg-secondary hover:text-accent-fg cursor-pointer"
					>
						<Code2 size={11} />
					</Tooltip.Trigger>
					<Tooltip.Content>
						<Text variant="high" size="xs">Definir com Python</Text>
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
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

const flattenOptions = (options: IOptionEntrySchema[]): IOptionValueSchema[] =>
	options.flatMap(option => "categoryName" in option ? option.options : [option]);

type OptionsFieldProps = {
	value: string | undefined;
	options: IOptionEntrySchema[];
	onChange: (value: string) => void;
};

// A real select — one of the declared options; categories group them. A
// value that isn't one of them (an older workflow's) shows as it is until
// another is picked.
const OptionsField: React.FC<OptionsFieldProps> = ({ value, options, onChange }) => {

	const flat = flattenOptions(options);
	const known = flat.some(option => option.value === value);

	return (
		<Select.Root value={known ? value : ""} onValueChange={onChange} className="nodrag w-48">
			<Select.Trigger placeholder={value && !known ? value : "Pick one"} />
			<Select.Content>
				{options.length === 0 && <Text variant="low" size="xs" className="px-2 py-1.5">No options</Text>}
				{options.map((option, index) => (
					"categoryName" in option ? (
						<Fragment key={option.categoryName}>
							<Text variant="low" size="xs" className={clsx("block px-2 pb-1", index > 0 ? "pt-3" : "pt-1")}>{option.categoryName}</Text>
							{option.options.map(nested => (
								<Select.Item key={nested.value} value={nested.value}>{nested.displayName}</Select.Item>
							))}
						</Fragment>
					) : (
						<Select.Item key={option.value} value={option.value}>{option.displayName}</Select.Item>
					)
				))}
			</Select.Content>
		</Select.Root>
	);

};

// An integer takes a whole number, a float a fractional part too — both may be negative.
const ANY_KIND_PATTERNS: Record<Exclude<IAnyValueKindSchema, "bool">, RegExp> = {
	integer: /^-?\d+$/,
	float: /^-?\d+(\.\d+)?$/,
};

type AnyFieldProps = {
	value: IAnyValueSchema | undefined;
	availables: IAnyValueKindSchema[];
	onChange: (value: IAnyValueSchema) => void;
};

const AnyField: React.FC<AnyFieldProps> = ({ value, availables, onChange }) => {

	const kinds = availables;
	const kind = value?.kind ?? kinds[0]!;
	const [draft, setDraft] = useSyncedDraft(value, v => (v?.value !== undefined ? String(v.value) : ""));

	const commitValue = () => {

		if (kind === "bool") {
			const normalized = draft.trim().toLowerCase();
			if (["true", "1", "yes", "on"].includes(normalized)) return onChange({ kind, value: true });
			if (["false", "0", "no", "off"].includes(normalized)) return onChange({ kind, value: false });
			return setDraft(value?.value !== undefined ? String(value.value) : "");
		}

		const trimmed = draft.trim();
		if (!ANY_KIND_PATTERNS[kind].test(trimmed)) return setDraft(value?.value !== undefined ? String(value.value) : "");
		onChange({ kind, value: Number(trimmed) });

	};

	const changeKind = (nextKind: string) => {
		const next = nextKind === "bool" ? false : 0;
		setDraft(String(next));
		onChange({ kind: nextKind as IAnyValueKindSchema, value: next });
	};

	return (
		<Input.Root className="nodrag w-36!">

			<Input.Field
				placeholder={kind === "bool" ? "true / false" : "0"}
				value={draft}
				onChange={e => setDraft(e.target.value)}
				onBlur={commitValue}
			/>

			<Input.Select value={kind} onValueChange={changeKind}>
				{kinds.map(available => (
					<Select.Item key={available} value={available}>
						{available}
					</Select.Item>
				))}
			</Input.Select>


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
		<div className="flex items-center gap-2 w-36">

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
						"nodrag flex items-center gap-2 w-36 h-8 px-2 rounded-md border text-left cursor-pointer",
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
