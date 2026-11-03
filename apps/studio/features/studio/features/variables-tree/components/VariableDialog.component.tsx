import { useState } from "react";
import { Button, Dialog, Input, Switch, Text, ToggleGroup } from "@henglosio/ui";
import {
	emptyShapeValue,
	isListShape,
	isObjectShape,
	isStructuredVariableType,
	validateShape,
	validateVariableName,
	variableInitialError,
	type IShape,
	type IVariableRuntime,
	type IVariableType,
	type IWorkflowRuntime,
} from "@henglosio/workflow";
import { Binary, Braces, Hash, List, ToggleLeft, Type, Variable, X } from "lucide-react";
import { ShapeBuilder, fieldsError } from "@/features/studio/components/ShapeEditor/ShapeBuilder.component";
import { ShapeValueEditor } from "@/features/studio/components/ShapeEditor/ShapeValueEditor.component";
import { useAtomValue } from "jotai";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";
import { BoardLimitsAtom } from "@/features/studio/store/platform.store";
import { useFloatingBeside, type FloatingAnchor } from "@/features/studio/lib/useFloatingBeside";

// `hint` gets the board's text limit — MAX_DATA_BUFFER, which Platform settings can change.
const TYPES: { value: IVariableType; label: string; hint: (maxText: number) => string; icon: React.ReactNode }[] = [
	{ value: "number", label: "Number", hint: () => "Decimal number — 3.14, -0.5", icon: <Hash size={12} /> },
	{ value: "integer", label: "Integer", hint: () => "Whole number — counters, states, indexes", icon: <Binary size={12} /> },
	{ value: "boolean", label: "Bool", hint: () => "true or false", icon: <ToggleLeft size={12} /> },
	{ value: "text", label: "Text", hint: maxText => `Up to ${maxText} bytes of text (the board's config value size)`, icon: <Type size={12} /> },
	{ value: "array", label: "List", hint: maxText => `A list — a history of readings, say (Append adds to it). Up to ${maxText} bytes as JSON.`, icon: <List size={12} /> },
	{ value: "object", label: "Object", hint: maxText => `Named fields (Set Field changes one). Up to ${maxText} bytes as JSON.`, icon: <Braces size={12} /> },
];

// The object's fields that need a name — the variable's own, or its list items'.
const shapeFieldsError = (shape: IShape): string | null =>
	isObjectShape(shape) ? fieldsError(shape.object)
	: isListShape(shape) && isObjectShape(shape.array) ? fieldsError(shape.array.object)
	: null;

// What a new list / object variable holds until the user says otherwise.
const DEFAULT_SHAPES: Partial<Record<IVariableType, IShape>> = {
	array: { array: "float" },
	object: { object: { value: "float" } },
};

// What each numeric field lets through while typing — partial numbers too
// ("-", "1.") so the user can get to a valid one; a key that can't lead to a
// number is simply not taken.
const TYPING: Partial<Record<IVariableType, RegExp>> = {
	number: /^-?\d*\.?\d*$/,
	integer: /^-?\d*$/,
};

const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

/** The typed initial value from the field — null for "none", or an error message. */
const parseInitial = (type: IVariableType, text: string, flag: boolean): IVariableRuntime["initial"] | { error: string } => {
	if (type === "boolean") return flag;
	if (type === "text") return text === "" ? null : text;

	if (text === "") return null;
	const value = Number(text);
	if (!Number.isFinite(value) || text === "-" || text === "." || text === "-.") return { error: "Not a number yet." };
	return value;
};

// Re-exported for the Variables list, which opens this window.
export { anchorOf, type FloatingAnchor as VariableDialogAnchor } from "@/features/studio/lib/useFloatingBeside";

type VariableDialogProps = {
	workflow: IWorkflowRuntime;
	/** Editing this one; creating a new variable when absent. */
	variable?: IVariableRuntime;
	anchor: FloatingAnchor;
	onClose: () => void;
};

/**
 * Create / edit a workflow variable, in a window floating beside the sidebar —
 * the Variables list itself is too narrow for the name, type and initial
 * value. Non-modal, no overlay: the canvas stays visible; a click outside,
 * Esc or Cancel closes it.
 */
export const VariableDialog: React.FC<VariableDialogProps> = ({ workflow, variable, anchor, onClose }) => {

	const { measureRef, style } = useFloatingBeside<HTMLFormElement>(anchor, 384);

	const mutate = useWorkflowMutate();
	// Text is one config value on the board: the workflow's MAX_DATA_BUFFER bytes at most.
	const maxText = useAtomValue(BoardLimitsAtom).protocol.maxData;
	const [name, setName] = useState(variable?.name ?? "");
	const [type, setType] = useState<IVariableType>(variable?.type ?? "number");
	const [text, setText] = useState(variable && variable.type !== "boolean" && variable.initial !== null ? String(variable.initial) : "");
	const [flag, setFlag] = useState(variable?.type === "boolean" ? variable.initial === true : false);
	const [touched, setTouched] = useState(false);
	// A list / object variable: what it holds, and its initial value (empty to start).
	const [shape, setShape] = useState<IShape | undefined>(variable?.shape ?? DEFAULT_SHAPES[variable?.type ?? "number"]);
	const [structured, setStructured] = useState<unknown>(
		variable && isStructuredVariableType(variable.type) ? variable.initial ?? emptyShapeValue(variable.shape!) : null,
	);

	const isStructured = isStructuredVariableType(type);
	const nameError = name === "" ? (touched ? "Give it a name." : null) : validateVariableName(workflow, name, variable?.id);
	const parsed = isStructured ? (structured as IVariableRuntime["initial"]) : parseInitial(type, text, flag);
	const shapeError = isStructured && shape ? shapeFieldsError(shape) : null;
	const initialError = shapeError
		?? (!isStructured && parsed !== null && typeof parsed === "object" && "error" in parsed ? (parsed as { error: string }).error
		: variableInitialError(type, parsed, maxText, isStructured ? shape : undefined));
	const canSubmit = name !== "" && !nameError && !initialError;

	const changeShape = (next: IShape) => {
		setShape(next);
		// Keep the initial value when it still fits the new shape.
		if (validateShape(next, structured) !== null) setStructured(emptyShapeValue(next));
	};

	const changeType = (next: IVariableType) => {
		setType(next);
		if (isStructuredVariableType(next)) {
			const nextShape = shape && (next === "object" ? isObjectShape(shape) : !isObjectShape(shape)) ? shape : DEFAULT_SHAPES[next]!;
			setShape(nextShape);
			if (structured === null || validateShape(nextShape, structured) !== null) setStructured(emptyShapeValue(nextShape));
			return;
		}
		// Keep what was typed when it still reads as the new type.
		if (next === "integer" && text.includes(".")) setText(text.split(".")[0]!);
		else if (TYPING[next] && !TYPING[next]!.test(text)) setText("");
	};

	const editText = (next: string) => {
		const normalized = type === "number" ? next.replace(",", ".") : next;
		const typing = TYPING[type];
		if (typing && !typing.test(normalized)) return;
		setText(normalized);
	};

	const submit = (e?: React.FormEvent) => {
		e?.preventDefault();
		setTouched(true);
		if (!canSubmit || (!isStructured && parsed !== null && typeof parsed === "object")) return;

		const withShape = isStructured && shape ? { shape } : {};
		if (variable) {
			mutate({ op: "update:variable", variableId: variable.id, name, type, initial: parsed, ...withShape });
		} else {
			mutate({ op: "add:variable", variable: { id: crypto.randomUUID(), name, type, initial: parsed, ...withShape } });
		}
		onClose();
	};

	const selected = TYPES.find(option => option.value === type)!;

	return (

		<Dialog.Root open modal={false} onOpenChange={open => { if (!open) onClose(); }}>
			<Dialog.Content
				hideOverlay
				style={style}
				className="max-h-[calc(100vh-16px)] overflow-y-auto rounded-lg border border-line shadow-[0_8px_32px_rgb(0_0_0/0.4)]"
				aria-describedby={undefined}
			>
				<form ref={measureRef} onSubmit={submit} className="flex flex-col">

					<div className="flex items-center gap-2 px-4 h-11 border-b border-line-subtle">
						<Variable size={14} className="text-accent-fg" />
						<Dialog.Title>{variable ? "Edit variable" : "New variable"}</Dialog.Title>
						<Dialog.Close asChild>
							<Button.Root type="button" variant="ghost" className="p-2! ml-auto">
								<Button.Icon>
									<X size={12} />
								</Button.Icon>
							</Button.Root>
						</Dialog.Close>
					</div>

					<div className="flex flex-col gap-5 p-4">

						<Field label="Name" hint={`Scripts read it with ctx.var("${name || "name"}").`} error={nameError}>
							<Input.Root className="h-8" value={name}>
								<Input.Prefix className="font-mono text-fg-muted">$</Input.Prefix>
								<Input.Field
									autoFocus
									placeholder="temperature"
									value={name}
									onChange={e => setName(e.target.value)}
									onBlur={() => setTouched(true)}
									className="font-mono"
								/>
							</Input.Root>
						</Field>

						<Field label="Type" hint={selected.hint(maxText)}>
							<ToggleGroup.Root size="md" value={type} onValueChange={value => changeType(value as IVariableType)} className="w-full">
								{TYPES.map(option => (
									<ToggleGroup.Item key={option.value} value={option.value} className="flex-1 justify-center">
										{option.icon}
										{option.label}
									</ToggleGroup.Item>
								))}
							</ToggleGroup.Root>
						</Field>

						{isStructured && shape && (
							<Field label={type === "array" ? "Holds" : "Fields"} hint={type === "array" ? "What each item is." : "Its fields and what each holds."}>
								<ShapeBuilder shape={shape} onChange={changeShape} />
							</Field>
						)}

						<Field
							label="Initial value"
							hint={type === "boolean" ? "What it holds when the program starts."
								: isStructured ? "What it holds when the program starts — empty is fine."
								: "Optional — empty: no value until a Set writes one."}
							error={initialError}
						>
							{isStructured && shape ? (
								<ShapeValueEditor shape={shape} value={structured} onChange={setStructured} />
							) : type === "boolean" ? (
								<div className="flex items-center gap-2 h-8">
									<Switch.Root checked={flag} onCheckedChange={setFlag} />
									<Text variant="dim" size="sm" font="mono">{flag ? "true" : "false"}</Text>
								</div>
							) : (
								<Input.Root className="h-8" value={text}>
									<Input.Field
										inputMode={type === "text" ? "text" : type === "integer" ? "numeric" : "decimal"}
										placeholder={type === "text" ? "hello" : type === "integer" ? "0" : "0.0"}
										value={text}
										onChange={e => editText(e.target.value)}
										className={type === "text" ? undefined : "font-mono tabular-nums"}
									/>
									{type === "text" && (
										<Input.Affix className="tabular-nums">{utf8Bytes(text)}/{maxText}</Input.Affix>
									)}
								</Input.Root>
							)}
						</Field>

					</div>

					<div className="flex justify-end gap-2 px-4 py-3 border-t border-line-subtle">
						<Dialog.Close asChild>
							<Button.Root type="button" variant="ghost" size="md">
								<Button.Label>Cancel</Button.Label>
							</Button.Root>
						</Dialog.Close>
						<Button.Root type="submit" variant="primary" size="md" disabled={!canSubmit}>
							<Button.Label>{variable ? "Save" : "Create"}</Button.Label>
						</Button.Root>
					</div>

				</form>
			</Dialog.Content>
		</Dialog.Root>

	);

};

type FieldProps = {
	label: string;
	hint?: string;
	error?: string | null;
	children: React.ReactNode;
};

const Field: React.FC<FieldProps> = ({ label, hint, error, children }) => (
	<div className="flex flex-col gap-1.5">
		<Text variant="dim" size="xs">{label}</Text>
		{children}
		{error
			? <Text variant="low" size="xs" className="text-danger!">{error}</Text>
			: hint && <Text variant="low" size="xs">{hint}</Text>}
	</div>
);
