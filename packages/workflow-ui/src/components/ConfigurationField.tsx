import { Fragment, useEffect, useState } from "react";
import { Badge, Button, Dropdown, Input, Select, Switch, Text, Tooltip } from "@henglosio/ui";
import { ConfigurationParser } from "@henglosio/workflow";
import type { IActionRuntime, IAnyValueKindSchema, IAnyValueSchema, IBoardRuntime, IComponentRuntime, IConfigurationRuntime, IConfigurationSchema, IOptionEntrySchema, IOptionValueSchema, IPinSchema, IVariableRuntime } from "@henglosio/workflow";
import { ChevronDown, Code2, Variable, X } from "lucide-react";
import clsx from "clsx";
import { OUTPUT_DRAG_MIME, isVariableDrag, unpackOutputDragPayload, unpackVariableDragPayload } from "../lib/dnd";
import { isOutputBindAllowed } from "../lib/isOutputBindAllowed";
import { useSyncedDraft } from "../lib/useSyncedDraft";
import { useWorkflowCanvas } from "../context";

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
]);

type ConfigurationFieldProps = {
	configuration: IConfigurationRuntime;
	component: IComponentRuntime;
	action: IActionRuntime;
	/** Start's fields: plain values — nothing runs before it to bind to. */
	start: boolean;
};

/**
 * One configuration of a node: its label and its editor — or, on a read-only
 * canvas (or with no handlers), the same field locked. What editing does
 * comes from the canvas (WorkflowCanvasProvider's `configurations`).
 */
export const ConfigurationField: React.FC<ConfigurationFieldProps> = ({ configuration, component, action, start }) => {

	const canvas = useWorkflowCanvas();
	const workflow = canvas.workflow;
	const handlers = canvas.readOnly ? undefined : canvas.configurations;
	const readOnly = !handlers;

	const actionId = action.id;
	const board = workflow?.board;
	const connections = workflow?.connections ?? [];
	const variables: IVariableRuntime[] = workflow?.variables ?? [];
	const target = { componentId: component.id, actionId, configurationId: configuration.id };

	const onChange = (value: IConfigurationRuntime["value"]) => handlers?.onChange(target, value);
	const onBindOutput = !start && handlers?.onBindOutput
		? (sourceActionId: string, outputName: string) => handlers.onBindOutput!(target, sourceActionId, outputName)
		: undefined;
	const onSetCode = !start && handlers?.onSetCode ? (code: string) => handlers.onSetCode!(target, code) : undefined;
	const onBindVariable = !start && handlers?.onBindVariable ? (variableId: string) => handlers.onBindVariable!(target, variableId) : undefined;

	const { base, value, binding } = configuration;
	const [draft, setDraft] = useSyncedDraft(value, v => v);
	// What's being dragged over the field: something it takes ("ok"), or not ("deny").
	const [dragState, setDragState] = useState<"ok" | "deny" | null>(null);
	const outputDrag = canvas.outputDrag ?? null;
	const codeEditor = readOnly ? undefined : canvas.codeEditor;
	const isEditorOpen = codeEditor?.openFor?.actionId === actionId && codeEditor?.openFor?.configurationId === configuration.id;
	// Why the typed value doesn't pass the config's filters (patterns), if it doesn't.
	const [filterError, setFilterError] = useState<string | null>(null);

	// A value changed from elsewhere (collab, undo) replaces the draft — and its error.
	useEffect(() => setFilterError(null), [value]);

	if (!board) return null;

	// An output binding survives its source action being disconnected/removed —
	// it keeps pointing at binding.actionId, but nothing upstream feeds it anymore.
	const isBindingBroken = !!binding && "actionId" in binding && !connections.some(c => c.source === binding.actionId && c.target === actionId);

	// Whether the output currently being dragged is legal to bind here: not the
	// action's own output, and not the output of an action ahead of this one in
	// the flow (see isOutputBindAllowed).
	const isDragBindAllowed = !!outputDrag && isOutputBindAllowed(actionId, outputDrag.actionId, connections);

	// Any config can read a variable — except Set's own "which variable" and a
	// script field (a variable holding the source to run means nothing).
	const canBindVariable = !!onBindVariable && base.type !== "variable" && base.type !== "code";

	const onDragOver = (e: React.DragEvent) => {
		if (isVariableDrag(e)) {
			if (!canBindVariable) {
				setDragState("deny");
				e.dataTransfer.dropEffect = "none";
				return;
			}
			setDragState("ok");
			e.preventDefault();
			e.dataTransfer.dropEffect = "link";
			return;
		}
		if (!onBindOutput || !outputDrag || !e.dataTransfer.types.includes(OUTPUT_DRAG_MIME)) return;
		if (!isDragBindAllowed) {
			setDragState("deny");
			e.dataTransfer.dropEffect = "none";
			return;
		}
		setDragState("ok");
		e.preventDefault();
		e.dataTransfer.dropEffect = "link";
	};

	const onDrop = (e: React.DragEvent) => {
		setDragState(null);

		const variableId = unpackVariableDragPayload(e);
		if (variableId) {
			if (!canBindVariable) return;
			e.preventDefault();
			onBindVariable!(variableId);
			return;
		}

		if (!onBindOutput || !isDragBindAllowed) return;
		const payload = unpackOutputDragPayload(e);
		if (!payload) return;
		e.preventDefault();
		onBindOutput(payload.actionId, payload.outputName);
	};

	const dragRing = dragState === "ok" ? "ring-1 ring-accent" : dragState === "deny" ? "ring-1 ring-danger" : undefined;

	const dropTarget = readOnly ? {} : {
		onDragOver,
		onDragLeave: () => setDragState(null),
		onDrop,
	};

	// Unbinds back to a literal — an editable canvas only.
	const unbind = !readOnly && (
		<Button.Root variant="ghost" className="p-2!" onClick={() => onChange(undefined)}>
			<Button.Icon>
				<X size={12} />
			</Button.Icon>
		</Button.Root>
	);

	if (binding && "code" in binding) {

		const trimmed = binding.code.trim();
		const preview = trimmed.length > 0 ? trimmed.split("\n")[0]!.slice(0, 40) : readOnly ? "Empty script" : "Vazio — clique para escrever";

		const openEditor = () => codeEditor?.open({
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
						disabled={!codeEditor}
						className={clsx(
							// Same box as Input.Root, so it lines up with the other fields.
							"nodrag flex-1 min-w-0 flex items-center gap-2 h-8 px-2 rounded-md border text-left",
							"border-line bg-field transition-colors",
							codeEditor && "hover:bg-field-hover cursor-pointer",
							isEditorOpen && "ring-1 ring-accent",
						)}
					>
						<Code2 size={12} className="text-accent-fg shrink-0" />
						<Text variant="dim" size="xs" font="mono" className="truncate">{preview}</Text>
					</button>
					{unbind}
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
					{unbind}
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
					{unbind}
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
		if (readOnly) return;
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
	// editor opens immediately) — only where onSetCode is wired and the field's
	// type actually has a representable RESULT TYPE (CODE_ELIGIBLE_TYPES).
	const openCodeMode = () => {
		onSetCode?.("");
		codeEditor?.open({
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
				onEnableCode={onSetCode && codeEditor && CODE_ELIGIBLE_TYPES.has(base.type) ? openCodeMode : undefined}
			/>

			<div className={clsx(dragRing, dragRing && "rounded-md")}>

				{base.type === "string" && (
					<Input.Root className={clsx("nodrag", filterError && "ring-1 ring-danger rounded-md")} value={draft as string ?? ""}>
						<Input.Field
							placeholder={base.placeholder}
							value={draft as string ?? ""}
							readOnly={readOnly}
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
							readOnly={readOnly}
							onChange={e => editDraft(e.target.value)}
							onBlur={() => commitChecked(draft as string | undefined)}
						/>
					</Input.Root>
				)}

				{(base.type === "integer" || base.type === "float") && (
					<Input.Root className={clsx("nodrag", filterError && "ring-1 ring-danger rounded-md")} value={draft as string ?? ""}>
						{!readOnly && (
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
						)}
						<Input.Field
							type="text"
							placeholder={base.placeholder}
							value={draft as string ?? ""}
							readOnly={readOnly}
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
							disabled={readOnly}
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
								disabled={readOnly}
								onChange={e => commit(e.target.value)}
								className="size-4 rounded-xs border-none cursor-pointer bg-transparent disabled:cursor-default"
							/>
						</Input.Prefix>
						<Input.Field
							value={draft as string ?? ""}
							placeholder="#000000"
							readOnly={readOnly}
							onChange={e => setDraft(e.target.value)}
							onBlur={() => !readOnly && commit(draft)}
						/>
					</Input.Root>
				)}

				{base.type === "code" && (
					<CodeField
						value={draft as string ?? ""}
						readOnly={!codeEditor}
						isOpen={isEditorOpen}
						onOpen={() => codeEditor?.open({
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
						readOnly={readOnly}
						onChange={commit}
					/>
				)}

				{base.type === "any" && (
					<AnyField
						value={draft as IAnyValueSchema | undefined}
						availables={base.availables}
						readOnly={readOnly}
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
						readOnly={readOnly}
						onChange={commit}
					/>
				)}

				{base.type === "variable" && (
					<VariableField
						value={draft as string | undefined}
						variables={variables}
						readOnly={readOnly}
						onChange={commit}
					/>
				)}

				{base.type === "bytes" && (
					<Text variant="dim" size="xs">Definido via binding ou script — sem edição manual</Text>
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
		<Text variant="dim" size="xs">{base.displayName}</Text>
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
	readOnly: boolean;
	isOpen: boolean;
	onOpen: () => void;
};

// Edits nothing here — it's only the "trigger" that opens the app's code editor
// (WorkflowCanvasOptions.codeEditor). The node stays small on purpose: really
// writing / reading the script needs more room than a config card has.
const CodeField: React.FC<CodeFieldProps> = ({ value, readOnly, isOpen, onOpen }) => {

	const trimmed = value.trim();
	const preview = trimmed.length > 0 ? trimmed.split("\n")[0]!.slice(0, 40) : readOnly ? "Empty script" : "Vazio — clique para escrever";

	return (
		<button
			type="button"
			onClick={onOpen}
			disabled={readOnly}
			className={clsx(
				"nodrag flex items-center gap-2 w-full min-w-0 h-8 px-2 rounded-md border text-left",
				"border-line bg-field transition-colors",
				!readOnly && "hover:bg-field-hover cursor-pointer",
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

// The dropdown arrow at the end of a field — inert on a read-only canvas. A
// Dropdown.Trigger child (asChild): its handlers and ref come in as props.
const DropdownArrow = (props: React.ComponentProps<"button">) => (
	<button
		type="button"
		{...props}
		className="shrink-0 h-full px-2 flex items-center justify-center border-l border-line text-fg-muted enabled:hover:text-fg enabled:cursor-pointer"
	>
		<ChevronDown size={14} />
	</button>
);

type OptionsFieldProps = {
	value: string | undefined;
	options: IOptionEntrySchema[];
	readOnly: boolean;
	onChange: (value: string) => void;
};

const OptionsField: React.FC<OptionsFieldProps> = ({ value, options, readOnly, onChange }) => {

	const flat = flattenOptions(options);
	const labelFor = (raw: string | undefined) => flat.find(option => option.value === raw)?.displayName ?? raw ?? "";

	const [draft, setDraft] = useSyncedDraft(value, labelFor);

	const commitText = () => {
		if (readOnly) return;
		const matched = flat.find(option => option.displayName === draft || option.value === draft);
		setDraft(matched ? matched.displayName : draft);
		onChange(matched ? matched.value : draft);
	};

	const selectOption = (option: IOptionValueSchema) => {
		setDraft(option.displayName);
		onChange(option.value);
	};

	return (
		<Input.Root className="nodrag w-36!">

			<Input.Field
				type="text"
				value={draft}
				readOnly={readOnly}
				onChange={e => setDraft(e.target.value)}
				onBlur={commitText}
			/>

			{readOnly ? <DropdownArrow disabled /> : (
				<Dropdown.Root>
					<Dropdown.Trigger asChild>
						<DropdownArrow />
					</Dropdown.Trigger>
					<Dropdown.Content align="end">
						{options.length === 0 && (
							<Dropdown.Item disabled>Nenhuma opção disponível</Dropdown.Item>
						)}
						{options.map((option, index) => (
							"categoryName" in option ? (
								<Fragment key={option.categoryName}>
									{index > 0 && <Dropdown.Separator />}
									<Dropdown.Label className="px-4 py-2 text-fg-muted">
										{option.categoryName}
									</Dropdown.Label>
									{option.options.map(nested => (
										<Dropdown.Item key={nested.value} onSelect={() => selectOption(nested)}>
											{nested.displayName}
										</Dropdown.Item>
									))}
								</Fragment>
							) : (
								<Dropdown.Item key={option.value} onSelect={() => selectOption(option)}>
									{option.displayName}
								</Dropdown.Item>
							)
						))}
					</Dropdown.Content>
				</Dropdown.Root>
			)}

		</Input.Root>
	);

};

// An integer takes a whole number, a float a fractional part too — both may be negative.
const ANY_KIND_PATTERNS: Record<"integer" | "float", RegExp> = {
	integer: /^-?\d+$/,
	float: /^-?\d+(\.\d+)?$/,
};

/** What a value of `kind` starts as, when the kind is picked. */
const emptyAnyValue = (kind: IAnyValueKindSchema): IAnyValueSchema["value"] =>
	kind === "bool" ? false : kind === "string" ? "" : kind === "list" ? [] : kind === "object" ? {} : 0;

// A list / an object shows as its JSON; anything else as its text.
const anyText = (value: IAnyValueSchema | undefined) =>
	value === undefined ? "" : typeof value.value === "object" ? JSON.stringify(value.value) : String(value.value);

type AnyFieldProps = {
	value: IAnyValueSchema | undefined;
	availables: IAnyValueKindSchema[];
	readOnly: boolean;
	onChange: (value: IAnyValueSchema) => void;
};

const AnyField: React.FC<AnyFieldProps> = ({ value, availables, readOnly, onChange }) => {

	const kinds = availables;
	const kind = value?.kind ?? kinds[0]!;
	const [draft, setDraft] = useSyncedDraft(value, anyText);

	const commitValue = () => {

		if (readOnly) return;
		const revert = () => setDraft(anyText(value));

		switch (kind) {
			case "bool": {
				const normalized = draft.trim().toLowerCase();
				if (["true", "1", "yes", "on"].includes(normalized)) return onChange({ kind, value: true });
				if (["false", "0", "no", "off"].includes(normalized)) return onChange({ kind, value: false });
				return revert();
			}
			case "string":
				return onChange({ kind, value: draft });
			case "list":
			case "object": {
				try {
					const parsed: unknown = JSON.parse(draft);
					const fits = kind === "list" ? Array.isArray(parsed) : !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
					return fits ? onChange({ kind, value: parsed as IAnyValueSchema["value"] }) : revert();
				} catch {
					return revert();
				}
			}
			default: {
				const trimmed = draft.trim();
				if (!ANY_KIND_PATTERNS[kind].test(trimmed)) return revert();
				return onChange({ kind, value: Number(trimmed) });
			}
		}

	};

	const changeKind = (nextKind: string) => {
		const next = { kind: nextKind as IAnyValueKindSchema, value: emptyAnyValue(nextKind as IAnyValueKindSchema) };
		setDraft(anyText(next));
		onChange(next);
	};

	return (
		<Input.Root className={kind === "list" || kind === "object" || kind === "string" ? "nodrag w-48!" : "nodrag w-36!"}>

			<Input.Field
				placeholder={kind === "bool" ? "true / false" : kind === "string" ? "text" : kind === "list" ? "[1, 2]" : kind === "object" ? '{"a": 1}' : "0"}
				value={draft}
				readOnly={readOnly}
				onChange={e => setDraft(e.target.value)}
				onBlur={commitValue}
			/>

			<Input.Select value={kind} onValueChange={changeKind} disabled={readOnly}>
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
	readOnly: boolean;
	onChange: (pin: IPinSchema) => void;
};

const PinField: React.FC<PinFieldProps> = ({ value, from, filterBy, component, board, readOnly, onChange }) => {

	const available = (from === "board" ? board.base.pins : (component.base.pins ? [component.base.pins] : []))
		.filter(pin => !filterBy || filterBy.every(capability => pin.type.includes(capability)));

	const [draft, setDraft] = useSyncedDraft(value, v => (v?.gpio !== undefined ? String(v.gpio) : ""));

	const commitGpio = () => {
		if (readOnly) return;
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
					readOnly={readOnly}
					onChange={e => setDraft(e.target.value)}
					onBlur={commitGpio}
				/>
				{readOnly ? <DropdownArrow disabled /> : (
					<Dropdown.Root>
						<Dropdown.Trigger asChild>
							<DropdownArrow />
						</Dropdown.Trigger>
						<Dropdown.Content align="end">
							{available.length === 0 && (
								<Dropdown.Item disabled>Nenhum pino disponível</Dropdown.Item>
							)}
							{available.map(pin => (
								<Dropdown.Item key={pin.gpio} onSelect={() => selectPin(pin)}>
									{pin.displayName ?? `GPIO ${pin.gpio}`}
								</Dropdown.Item>
							))}
						</Dropdown.Content>
					</Dropdown.Root>
				)}
			</Input.Root>

		</div>
	);

}

type VariableFieldProps = {
	value: string | undefined;
	variables: IVariableRuntime[];
	readOnly: boolean;
	onChange: (variableId: string) => void;
};

// Picks which workflow variable — Variables / Set's target. Variables are
// created in the Variables list (under Components), not here.
const VariableField: React.FC<VariableFieldProps> = ({ value, variables, readOnly, onChange }) => {

	const selected = variables.find(variable => variable.id === value);
	const missing = value !== undefined && value !== "" && !selected;

	const trigger = (
		<button
			type="button"
			disabled={readOnly}
			className={clsx(
				"nodrag flex items-center gap-2 w-36 h-8 px-2 rounded-md border text-left",
				"bg-field transition-colors",
				!readOnly && "hover:bg-field-hover cursor-pointer",
				missing ? "border-danger" : "border-line",
			)}
		>
			<Variable size={12} className={clsx("shrink-0", selected ? "text-accent-fg" : "text-fg-muted")} />
			<Text variant={selected ? "high" : "low"} size="xs" font="mono" className="truncate flex-1">
				{selected ? selected.name : missing ? "removed variable" : "Pick a variable"}
			</Text>
			<ChevronDown size={14} className="shrink-0 text-fg-muted" />
		</button>
	);

	if (readOnly) return trigger;

	return (
		<Dropdown.Root>
			<Dropdown.Trigger asChild>
				{trigger}
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
