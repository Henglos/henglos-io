import { useState } from "react";
import { Button, Dialog, Input, Switch, Text, ToggleGroup } from "@henglosio/ui";
import {
	validateVariableName,
	type IShape,
	type IVariableRuntime,
	type IVariableType,
	type IWorkflowRuntime,
} from "@henglosio/workflow";
import { Variable, X } from "lucide-react";
import { ShapeValueEditor } from "@/features/studio/components/ShapeEditor/ShapeValueEditor.component";
import { useAtomValue } from "jotai";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";
import { BoardLimitsAtom } from "@/features/studio/store/platform.store";
import { useFloatingBeside, type FloatingAnchor } from "@/features/studio/lib/useFloatingBeside";

const TYPES: { value: IVariableType; label: string }[] = [
	{ value: "integer", label: "Integer" },
	{ value: "float", label: "Float" },
	{ value: "bool", label: "Bool" },
	{ value: "string", label: "String" },
	{ value: "list", label: "List" },
	{ value: "object", label: "Object" },
];

const DYNAMIC_LIST_SHAPE: IShape = { list: "any" };
const DYNAMIC_OBJECT_SHAPE: IShape = { object: {} };

const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

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
 * Create / edit a workflow variable, in a window floating beside the sidebar.
 * Layout switches cleanly according to the selected variable type.
 */
export const VariableDialog: React.FC<VariableDialogProps> = ({ workflow, variable, anchor, onClose }) => {
	const { measureRef, style } = useFloatingBeside<HTMLFormElement>(anchor, 384);
	const mutate = useWorkflowMutate();
	const maxText = useAtomValue(BoardLimitsAtom).protocol.maxData;

	const [name, setName] = useState(variable?.name ?? "");
	const [type, setType] = useState<IVariableType>(variable?.type ?? "integer");

	// Initial values per type
	const [numberText, setNumberText] = useState(() =>
		(variable?.type === "integer" || variable?.type === "float") && variable.initial !== null ? String(variable.initial) : "",
	);
	const [boolVal, setBoolVal] = useState(() =>
		variable?.type === "bool" ? variable.initial === true : false,
	);
	const [textVal, setTextVal] = useState(() =>
		variable?.type === "string" && typeof variable.initial === "string" ? variable.initial : "",
	);
	const [arrayVal, setArrayVal] = useState<unknown[]>(() =>
		variable?.type === "list" && Array.isArray(variable.initial) ? (variable.initial as unknown[]) : [],
	);
	const [objectVal, setObjectVal] = useState<Record<string, unknown>>(() =>
		variable?.type === "object" && variable.initial && typeof variable.initial === "object" && !Array.isArray(variable.initial)
			? (variable.initial as Record<string, unknown>)
			: {},
	);

	const [touched, setTouched] = useState(false);

	const getInitialValue = (): { value: IVariableRuntime["initial"]; error: string | null } => {
		switch (type) {
			case "bool":
				return { value: boolVal, error: null };
			case "integer":
			case "float": {
				if (numberText === "") return { value: null, error: null };
				const num = Number(numberText);
				if (!Number.isFinite(num) || numberText === "-" || numberText === "." || numberText === "-.") {
					return { value: null, error: "Not a number yet." };
				}
				if (type === "integer" && !Number.isInteger(num)) return { value: null, error: "An integer has no decimals." };
				return { value: num, error: null };
			}
			case "string": {
				const bytes = utf8Bytes(textVal);
				if (bytes > maxText) return { value: textVal, error: `At most ${maxText} bytes (has ${bytes}).` };
				return { value: textVal === "" ? null : textVal, error: null };
			}
			case "list": {
				if (!Array.isArray(arrayVal)) return { value: [], error: "Expected a list." };
				const jsonBytes = utf8Bytes(JSON.stringify(arrayVal));
				if (jsonBytes > maxText) return { value: arrayVal, error: `${jsonBytes} bytes as JSON — at most ${maxText}.` };
				return { value: arrayVal, error: null };
			}
			case "object": {
				if (!objectVal || typeof objectVal !== "object" || Array.isArray(objectVal)) {
					return { value: {}, error: "Expected an object." };
				}
				const jsonBytes = utf8Bytes(JSON.stringify(objectVal));
				if (jsonBytes > maxText) return { value: objectVal, error: `${jsonBytes} bytes as JSON — at most ${maxText}.` };
				return { value: objectVal, error: null };
			}
			default:
				return { value: null, error: null };
		}
	};

	const { value: parsedInitial, error: initialError } = getInitialValue();
	const nameError = name === "" ? (touched ? "Give it a name." : null) : validateVariableName(workflow, name, variable?.id);
	const canSubmit = name !== "" && !nameError && !initialError;

	const submit = (e?: React.FormEvent) => {
		e?.preventDefault();
		setTouched(true);
		if (!canSubmit) return;

		const shape = type === "list" ? DYNAMIC_LIST_SHAPE : type === "object" ? DYNAMIC_OBJECT_SHAPE : undefined;
		const withShape = shape ? { shape } : {};
		if (variable) {
			mutate({ op: "update:variable", variableId: variable.id, name, type, initial: parsedInitial, ...withShape });
		} else {
			mutate({ op: "add:variable", variable: { id: crypto.randomUUID(), name, type, initial: parsedInitial, ...withShape } });
		}
		onClose();
	};

	const fieldHint = () => {
		switch (type) {
			case "bool":
				return "What it holds when the program starts.";
			case "list":
			case "object":
				return "What it holds when the program starts — empty is fine.";
			default:
				return "Optional — empty: no value until a Set writes one.";
		}
	};

	/** Layout switch based on variable type */
	const renderLayout = () => {
		switch (type) {
			case "integer":
			case "float":
				return (
					<Input.Root className="h-8" value={numberText}>
						<Input.Field
							inputMode={type === "integer" ? "numeric" : "decimal"}
							placeholder={type === "integer" ? "0" : "0.0"}
							value={numberText}
							onChange={e => {
								const val = e.target.value.replace(",", ".");
								if ((type === "integer" ? /^-?\d*$/ : /^-?\d*\.?\d*$/).test(val)) setNumberText(val);
							}}
							className="font-mono tabular-nums"
						/>
					</Input.Root>
				);

			case "bool":
				return (
					<div className="flex items-center gap-2 h-8">
						<Switch.Root checked={boolVal} onCheckedChange={setBoolVal} />
						<Text variant="dim" size="sm" font="mono">{boolVal ? "true" : "false"}</Text>
					</div>
				);

			case "string":
				return (
					<Input.Root className="h-8" value={textVal}>
						<Input.Field
							inputMode="text"
							placeholder="hello"
							value={textVal}
							onChange={e => setTextVal(e.target.value)}
						/>
						<Input.Affix className="tabular-nums">{utf8Bytes(textVal)}/{maxText}</Input.Affix>
					</Input.Root>
				);

			case "list":
				return (
					<ShapeValueEditor
						shape={DYNAMIC_LIST_SHAPE}
						value={arrayVal}
						onChange={val => setArrayVal(Array.isArray(val) ? val : [])}
					/>
				);

			case "object":
				return (
					<ShapeValueEditor
						shape={DYNAMIC_OBJECT_SHAPE}
						value={objectVal}
						onChange={val => setObjectVal(val && typeof val === "object" && !Array.isArray(val) ? (val as Record<string, unknown>) : {})}
					/>
				);
		}
	};

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

						<Field label="Type">
							<ToggleGroup.Root
								size="md"
								value={type}
								onValueChange={value => {
									if (value) setType(value as IVariableType);
								}}
								className="w-full"
							>
								{TYPES.map(option => (
									<ToggleGroup.Item key={option.value} value={option.value} className="flex-1 justify-center">
										{option.label}
									</ToggleGroup.Item>
								))}
							</ToggleGroup.Root>
						</Field>

						<Field label="Initial value" hint={fieldHint()} error={initialError}>
							{renderLayout()}
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
		{error ? (
			<Text variant="low" size="xs" className="text-danger!">{error}</Text>
		) : (
			hint && <Text variant="low" size="xs">{hint}</Text>
		)}
	</div>
);
