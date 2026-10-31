import { useEffect, useState } from "react";
import { Button, Input, Switch, Text, Textarea } from "@henglosio/ui";
import { emptyShapeValue, isListShape, isObjectShape, pythonKind, shapeLabel, validateShape, type IShape } from "@henglosio/workflow";
import { ArrowDown, ArrowUp, Braces, List, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";

type ShapeValueEditorProps = {
	shape: IShape;
	value: unknown;
	onChange: (value: unknown) => void;
	/** A list's — no Add past it. */
	maxItems?: number;
	/** An object's fields as the user reads them (a config's displayNames) — the field name otherwise. */
	labels?: Record<string, string>;
	/** Nesting, for the inner editors — the top one also offers "edit as JSON" and shows the error. */
	depth?: number;
};

/**
 * Edits a value of a shape (see ShapeValue in @henglosio/workflow): a list as
 * rows to add, remove and reorder, an object as one row per field, a scalar as
 * its field — nested as deep as the shape goes. The top level can also be
 * edited as JSON (paste a whole value), and shows why the value doesn't fit.
 */
export const ShapeValueEditor: React.FC<ShapeValueEditorProps> = ({ shape, value, onChange, maxItems, labels, depth = 0 }) => {

	const [asJson, setAsJson] = useState(false);
	const problem = depth === 0 ? validateShape(shape, value ?? emptyShapeValue(shape)) : null;

	if (depth === 0 && (isListShape(shape) || isObjectShape(shape))) {
		return (
			<div className="flex flex-col gap-1.5 w-full nodrag">
				<div className="flex items-center gap-1">
					<Text variant="low" size="xs" className="truncate" title={shapeLabel(shape)}>{shapeLabel(shape)}</Text>
					<Button.Root variant="ghost" size="sm" className="ml-auto" onClick={() => setAsJson(!asJson)} title={asJson ? "Edit field by field" : "Edit as JSON"}>
						<Button.Icon>{asJson ? <List size={11} /> : <Braces size={11} />}</Button.Icon>
					</Button.Root>
				</div>
				{asJson
					? <JsonEditor shape={shape} value={value} onChange={onChange} />
					: <Structured shape={shape} value={value} onChange={onChange} maxItems={maxItems} labels={labels} depth={depth} />}
				{problem && !asJson && <Text variant="low" size="xs" className="text-danger!">{problem}</Text>}
			</div>
		);
	}

	return <Structured shape={shape} value={value} onChange={onChange} maxItems={maxItems} labels={labels} depth={depth} />;

};

const Structured: React.FC<ShapeValueEditorProps & { depth: number }> = ({ shape, value, onChange, maxItems, labels, depth }) => {

	if (isListShape(shape)) {
		const items = Array.isArray(value) ? value : [];
		const set = (next: unknown[]) => onChange(next);
		const move = (from: number, to: number) => {
			const next = [...items];
			const [moved] = next.splice(from, 1);
			next.splice(to, 0, moved);
			set(next);
		};
		const full = maxItems !== undefined && items.length >= maxItems;
		return (
			<div className={clsx("flex flex-col gap-1", depth > 0 && "pl-2 border-l border-line-subtle")}>
				{items.map((item, index) => (
					<div key={index} className="flex items-start gap-1">
						<Text variant="low" size="xs" className="w-5 shrink-0 pt-2 text-right tabular-nums">{index}</Text>
						<div className="flex-1 min-w-0">
							<ShapeValueEditor shape={shape.array} value={item} depth={depth + 1}
								onChange={next => set(items.map((old, i) => (i === index ? next : old)))} />
						</div>
						<div className="flex shrink-0">
							<Button.Root variant="ghost" size="sm" onClick={() => move(index, index - 1)} disabled={index === 0} title="Up">
								<Button.Icon><ArrowUp size={11} /></Button.Icon>
							</Button.Root>
							<Button.Root variant="ghost" size="sm" onClick={() => move(index, index + 1)} disabled={index === items.length - 1} title="Down">
								<Button.Icon><ArrowDown size={11} /></Button.Icon>
							</Button.Root>
							<Button.Root variant="ghost" size="sm" onClick={() => set(items.filter((_, i) => i !== index))} title="Remove">
								<Button.Icon><Trash2 size={11} className="text-danger" /></Button.Icon>
							</Button.Root>
						</div>
					</div>
				))}
				<Button.Root variant="ghost" size="sm" className="self-start" onClick={() => set([...items, emptyShapeValue(shape.array)])} disabled={full}
					title={full ? `At most ${maxItems}` : "Add an item"}>
					<Button.Icon><Plus size={11} /></Button.Icon>
					<Button.Label>{items.length === 0 ? "Add the first item" : "Add"}</Button.Label>
				</Button.Root>
			</div>
		);
	}

	if (isObjectShape(shape)) {
		const fields = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
		return (
			<div className={clsx("flex flex-col gap-1", depth > 0 && "pl-2 border-l border-line-subtle")}>
				{Object.entries(shape.object).map(([field, fieldShape]) => (
					<div key={field} className={clsx("flex gap-2", isListShape(fieldShape) || isObjectShape(fieldShape) ? "flex-col" : "items-center")}>
						<Text variant="dim" size="xs" className="shrink-0 min-w-14 font-mono">{labels?.[field] ?? field}</Text>
						<div className="flex-1 min-w-0">
							<ShapeValueEditor shape={fieldShape} value={fields[field] ?? emptyShapeValue(fieldShape)} depth={depth + 1}
								onChange={next => onChange({ ...fields, [field]: next })} />
						</div>
					</div>
				))}
			</div>
		);
	}

	return <ScalarEditor kind={shape} value={value} onChange={onChange} />;

};

// One scalar: text, a number (kept as typed until it reads as one), a bool.
const ScalarEditor: React.FC<{ kind: IShape; value: unknown; onChange: (value: unknown) => void }> = ({ kind: shape, value, onChange }) => {

	// A shape saved as "int32" or "text" is int / str.
	const kind = pythonKind(shape);
	const isText = kind === "str";
	const isInteger = kind === "int";
	const [draft, setDraft] = useState(value === undefined || value === null ? "" : String(value));

	// A value changed from elsewhere (collab, undo, a reorder) replaces what's typed.
	useEffect(() => {
		if (isText ? draft !== value : Number(draft) !== value) setDraft(value === undefined || value === null ? "" : String(value));
	}, [value]);

	if (kind === "bool") {
		return (
			<div className="flex items-center gap-2 h-7">
				<Switch.Root checked={value === true} onCheckedChange={onChange} />
				<Text variant="dim" size="xs" font="mono">{value === true ? "true" : "false"}</Text>
			</div>
		);
	}

	return (
		<Input.Root className="h-7" value={draft}>
			<Input.Field
				value={draft}
				inputMode={isText ? "text" : isInteger ? "numeric" : "decimal"}
				placeholder={isText ? "text" : "0"}
				className={isText ? undefined : "font-mono tabular-nums"}
				onChange={event => {
					const next = isText ? event.target.value : event.target.value.replace(",", ".");
					if (!isText && !(isInteger ? /^-?\d*$/ : /^-?\d*\.?\d*$/).test(next)) return;
					setDraft(next);
					if (isText) return onChange(next);
					const number = Number(next);
					if (next !== "" && next !== "-" && Number.isFinite(number)) onChange(number);
				}}
			/>
		</Input.Root>
	);

};

// The whole value as JSON — applied once it parses and fits the shape.
const JsonEditor: React.FC<{ shape: IShape; value: unknown; onChange: (value: unknown) => void }> = ({ shape, value, onChange }) => {

	const [text, setText] = useState(() => JSON.stringify(value ?? emptyShapeValue(shape), null, 2));
	const [error, setError] = useState<string | null>(null);

	return (
		<div className="flex flex-col gap-1">
			<Textarea.Root>
				<Textarea.Field
					value={text}
					rows={6}
					className="font-mono text-xs"
					onChange={event => {
						setText(event.target.value);
						try {
							const parsed = JSON.parse(event.target.value) as unknown;
							const problem = validateShape(shape, parsed);
							setError(problem);
							if (!problem) onChange(parsed);
						} catch {
							setError("Not valid JSON yet.");
						}
					}}
				/>
			</Textarea.Root>
			{error && <Text variant="low" size="xs" className="text-danger!">{error}</Text>}
		</div>
	);

};
