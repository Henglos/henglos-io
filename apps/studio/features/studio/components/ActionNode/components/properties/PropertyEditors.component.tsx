import { useId, useState } from "react";
import { useAtomValue } from "jotai";
import clsx from "clsx";
import { ArrowRightFromLine, Check, Info, Plus, Trash2, TriangleAlert, Variable, X } from "lucide-react";
import { Badge, Button, Dropdown, Input, Select, Switch, Text, Textarea } from "@henglosio/ui";
import {
	LOGIC_OPERATIONS,
	LOGIC_UNARY_OPERATIONS,
	nestedProperties,
	propertyKey,
	type IAssignmentCollectionValueSchema,
	type IAssignmentSchema,
	type IConfigurationSchema,
	type IFilterConditionSchema,
	type IFilterValueSchema,
	type IOptionEntrySchema,
	type IShape,
} from "@henglosio/workflow";
import { useSyncedDraft } from "@/features/studio/lib/useSyncedDraft";
import { useBindDroppable } from "@/features/studio/lib/bindDrag";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { ShapeValueEditor } from "@/features/studio/components/ShapeEditor/ShapeValueEditor.component";
import { flattenOptions, OptionsField } from "../OptionsField.component";

// The editors of n8n's property types (see IConfiguration.schema.ts) — each
// takes a value and hands back the next one. The ones of a collection's /
// a group's fields take typed-in values only (no binding): the collection as
// a whole binds, like any config.

const newId = () => crypto.randomUUID();

type Editor<T> = { value: T | undefined; onChange: (value: T) => void };

// ─── small ones ─────────────────────────────────────────────────────────────

/** A line of text — committed when it loses focus. Several lines with `rows`. */
export const TextValueField: React.FC<Editor<string> & { placeholder?: string; rows?: number; password?: boolean; mono?: boolean }> = ({ value, onChange, placeholder, rows, password, mono }) => {
	const [draft, setDraft] = useSyncedDraft(value ?? "", v => v);
	const commit = () => { if (draft !== (value ?? "")) onChange(draft); };

	if (rows && rows > 1) {
		return (
			<Textarea.Root value={draft}>
				<Textarea.Field rows={rows} value={draft} placeholder={placeholder} className={mono ? "font-mono" : undefined} onChange={e => setDraft(e.target.value)} onBlur={commit} />
			</Textarea.Root>
		);
	}
	return (
		<Input.Root value={draft}>
			<Input.Field type={password ? "password" : "text"} value={draft} placeholder={placeholder} className={mono ? "font-mono" : undefined} onChange={e => setDraft(e.target.value)} onBlur={commit} />
		</Input.Root>
	);
};

/** A number — within `min` / `max`; a draft that isn't one goes back to the value. */
const NumberValueField: React.FC<Editor<number> & { min?: number; max?: number; integer?: boolean; placeholder?: string }> = ({ value, onChange, min, max, integer, placeholder }) => {
	const [draft, setDraft] = useSyncedDraft(value, v => (v === undefined ? "" : String(v)));
	const [error, setError] = useState<string | null>(null);
	const commit = () => {
		const next = Number(draft.trim());
		const problem = draft.trim() === "" || !Number.isFinite(next) ? "Not a number."
			: integer && !Number.isInteger(next) ? "Must be a whole number."
			: min !== undefined && next < min ? `At least ${min}.`
			: max !== undefined && next > max ? `At most ${max}.`
			: null;
		setError(problem);
		if (!problem && next !== value) onChange(next);
	};
	return (
		<div className="flex flex-col gap-1">
			<Input.Root value={draft} className={clsx(error && "ring-1 ring-danger")}>
				<Input.Field inputMode="decimal" value={draft} placeholder={placeholder ?? "0"} className="tabular-nums" onChange={e => setDraft(e.target.value)} onBlur={commit} />
			</Input.Root>
			{error && <Text variant="low" size="xs" className="text-danger!">{error}</Text>}
		</div>
	);
};

/** n8n's dateTime: a date and time, kept as its ISO text. */
export const DateTimeField: React.FC<Editor<string>> = ({ value, onChange }) => (
	<Input.Root value={value ?? ""}>
		<Input.Field type="datetime-local" value={value ?? ""} onChange={e => onChange(e.target.value)} />
	</Input.Root>
);

/** n8n's json: JSON in a monospace box — checked when it loses focus. */
export const JsonField: React.FC<Editor<string> & { rows?: number }> = ({ value, onChange, rows }) => {
	const [draft, setDraft] = useSyncedDraft(value ?? "", v => v);
	const [error, setError] = useState<string | null>(null);
	const commit = () => {
		if (draft.trim() !== "") {
			try {
				JSON.parse(draft);
			} catch (e) {
				return setError(e instanceof Error ? e.message : "Not valid JSON.");
			}
		}
		setError(null);
		if (draft !== (value ?? "")) onChange(draft);
	};
	return (
		<div className="flex flex-col gap-1">
			<Textarea.Root value={draft} className={clsx(error && "ring-1 ring-danger")}>
				<Textarea.Field rows={rows ?? 4} value={draft} placeholder={'{ "key": "value" }'} className="font-mono text-xs" onChange={e => setDraft(e.target.value)} onBlur={commit} />
			</Textarea.Root>
			{error && <Text variant="low" size="xs" className="text-danger! break-words">{error}</Text>}
		</div>
	);
};

/** n8n's multiOptions: several choices, as removable tags. */
export const MultiOptionsField: React.FC<Editor<string[]> & { options: IOptionEntrySchema[] }> = ({ value, onChange, options }) => {
	const flat = flattenOptions(options);
	const picked = value ?? [];
	const labelOf = (v: string) => flat.find(option => option.value === v)?.displayName ?? v;
	const toggle = (v: string) => onChange(picked.includes(v) ? picked.filter(found => found !== v) : [...picked, v]);
	return (
		<Select.Root value="" onValueChange={toggle} className="nodrag w-full">
			<Select.MultiTrigger
				className="w-full"
				values={picked.map(labelOf)}
				placeholder="Pick some"
				onRemove={label => onChange(picked.filter(v => labelOf(v) !== label))}
			/>
			<Select.Content>
				{flat.map(option => (
					<Select.Item key={option.value} value={option.value}>
						<span className="flex items-center gap-2">
							<Check size={12} className={picked.includes(option.value) ? "text-accent-fg" : "invisible"} />
							{option.displayName}
						</span>
					</Select.Item>
				))}
			</Select.Content>
		</Select.Root>
	);
};

/** n8n's notice: a note in the node — its displayName is the text. */
export const NoticeField: React.FC<{ text: string; tone?: "info" | "warning" | "danger" }> = ({ text, tone = "info" }) => {
	const Icon = tone === "info" ? Info : TriangleAlert;
	return (
		<div className={clsx(
			"flex items-start gap-2 rounded-md border px-2.5 py-2",
			tone === "danger" ? "border-danger/40 bg-danger/10" : tone === "warning" ? "border-accent/40 bg-accent/10" : "border-line bg-field/60",
		)}>
			<Icon size={13} className={clsx("mt-0.5 shrink-0", tone === "danger" ? "text-danger" : "text-accent-fg")} />
			<Text variant="dim" size="xs" className="break-words">{text}</Text>
		</div>
	);
};


// ─── an operand: typed in, or an output / a variable dropped on it ──────────

// A value bound by a drop: the name the board reads it by (an output's, a
// variable's) — what henglosio.sdk's filter looks up. Shown as a pill, never
// as text: it's only how the value is kept.
const REFERENCE = /^\{\{\s*([A-Za-z_][\w ]*?)\s*\}\}$/;

/** The name a value refers to, or undefined when it's typed in. */
export const referenceOf = (value: unknown): string | undefined =>
	typeof value === "string" ? REFERENCE.exec(value.trim())?.[1] : undefined;

const toReference = (name: string) => `{{ ${name} }}`;

/**
 * A value — of a filter's condition, an assignment — typed in, or an action's
 * output / a workflow variable dragged onto it, shown as a pill (× takes it
 * off). The output's name is read lowercased on the board, as published; a
 * field inside one (a list's item…) can't be referred to by name: refused.
 */
export const OperandField: React.FC<Editor<string> & { placeholder?: string; mono?: boolean }> = ({ value, onChange, placeholder, mono }) => {
	const id = useId();
	const variables = useAtomValue(WorkflowAtom)?.data.variables ?? [];
	const drop = useBindDroppable(`operand:${id}`, {
		accepts: drag => drag.kind === "field" ? "deny" : "ok",
		onDrop: drag => onChange(toReference(drag.kind === "variable" ? drag.name : drag.kind === "output" ? drag.outputName.toLowerCase() : "")),
	});
	const ring = drop.state === "ok" ? "ring-1 ring-accent rounded-md" : drop.state === "deny" ? "ring-1 ring-danger rounded-md" : undefined;
	const reference = referenceOf(value);

	if (reference !== undefined) {
		const isVariable = variables.some(variable => variable.name.toLowerCase() === reference.toLowerCase());
		const Icon = isVariable ? Variable : ArrowRightFromLine;
		return (
			<div ref={drop.setNodeRef} className={clsx("flex items-center gap-1 h-8 min-w-0", ring)}>
				<Badge className="flex-1 min-w-0 h-8 justify-start" title={isVariable ? `The variable ${reference}` : `The output ${reference} of an action before this one`}>
					<span className="flex items-center gap-1.5 min-w-0 font-mono">
						<Icon size={11} className="shrink-0 text-accent-fg" />
						<span className="truncate">{reference}</span>
					</span>
				</Badge>
				<Button.Root variant="ghost" className="size-6 p-0! justify-center shrink-0" onClick={() => onChange("")} title="Unbind">
					<Button.Icon><X size={12} /></Button.Icon>
				</Button.Root>
			</div>
		);
	}

	return (
		<div ref={drop.setNodeRef} className={clsx("min-w-0", ring)}>
			<TextValueField value={value} onChange={onChange} placeholder={placeholder} mono={mono} />
		</div>
	);
};

// ─── a nested field ─────────────────────────────────────────────────────────

/** What a field of `property`'s type starts as, when it's added. */
export function emptyValueOf(property: IConfigurationSchema): unknown {
	if (property.defaultValue !== undefined) {
		return property.type === "integer" || property.type === "float" ? Number(property.defaultValue) : structuredClone(property.defaultValue);
	}
	switch (property.type) {
		case "toggle": return false;
		case "integer":
		case "float": return 0;
		case "options": return flattenOptions(property.options)[0]?.value ?? "";
		case "multiOptions": return [];
		case "list": return [];
		case "object":
		case "collection":
		case "fixedCollection": return {};
		case "filter": return { combinator: "and", conditions: [] };
		case "assignmentCollection": return { assignments: [] };
		default: return "";
	}
}

/**
 * A field of a collection, a group or the like: its editor by its type —
 * typed-in values only. A nested collection, group, filter… works too.
 */
export const PropertyValueEditor: React.FC<Editor<unknown> & { property: IConfigurationSchema }> = ({ property, value, onChange }) => {
	switch (property.type) {
		case "toggle":
			return <Switch.Root checked={Boolean(value)} onCheckedChange={onChange} />;
		case "integer":
		case "float":
			return <NumberValueField value={typeof value === "number" ? value : value === undefined ? undefined : Number(value)} onChange={onChange} min={property.minValue} max={property.maxValue} integer={property.type === "integer"} placeholder={property.placeholder} />;
		case "options":
			return <OptionsField value={value as string | undefined} options={property.options} onChange={onChange} className="w-full" />;
		case "multiOptions":
			return <MultiOptionsField value={value as string[] | undefined} options={property.options} onChange={onChange} />;
		case "dateTime":
			return <DateTimeField value={value as string | undefined} onChange={onChange} />;
		case "json":
			return <JsonField value={value as string | undefined} onChange={onChange} rows={property.rows} />;
		case "list":
		case "object": {
			const shape: IShape = property.type === "list" ? { list: property.items } : { object: Object.fromEntries(property.fields.map(field => [field.name, field.type])) };
			return <ShapeValueEditor shape={shape} value={value} onChange={onChange} />;
		}
		case "collection":
			return <CollectionField property={property} value={value as Record<string, unknown> | undefined} onChange={onChange} />;
		case "fixedCollection":
			return <FixedCollectionField property={property} value={value as Record<string, unknown> | undefined} onChange={onChange} />;
		case "filter":
			return <FilterField value={value as IFilterValueSchema | undefined} onChange={onChange} />;
		case "assignmentCollection":
			return <AssignmentCollectionField value={value as IAssignmentCollectionValueSchema | undefined} onChange={onChange} />;
		case "notice":
			return <NoticeField text={property.displayName} tone={property.tone} />;
		case "string":
		case "password":
		case "code":
		case "color":
			return (
				<TextValueField
					value={typeof value === "string" ? value : undefined}
					onChange={onChange}
					placeholder={"placeholder" in property ? property.placeholder : undefined}
					rows={property.type === "string" ? property.rows : property.type === "code" ? 4 : undefined}
					password={property.type === "password"}
					mono={property.type === "code"}
				/>
			);
		default:
			return <Text variant="low" size="xs">Set by a binding — not editable here.</Text>;
	}
};

/** A nested field with its name above it, and a way to take it out. */
const NestedField: React.FC<{ property: IConfigurationSchema; onRemove?: () => void; children: React.ReactNode }> = ({ property, onRemove, children }) => (
	<div className="group/nested flex flex-col gap-1.5 min-w-0">
		{property.type !== "notice" && (
			<div className="flex items-center gap-1.5 min-h-5">
				<Text variant="high" size="xs" className="font-medium truncate" title={property.description || undefined}>{property.displayName}</Text>
				{property.required && <span className="text-xs leading-4 text-danger">*</span>}
				{onRemove && (
					<button type="button" onClick={onRemove} className="ml-auto flex items-center justify-center size-5 rounded-sm text-fg-muted opacity-0 group-hover/nested:opacity-100 hover:text-danger hover:bg-hover cursor-pointer transition-opacity" title={`Remove ${property.displayName}`}>
						<Trash2 size={11} />
					</button>
				)}
			</div>
		)}
		{children}
		{property.hint && <Text variant="low" size="xs">{property.hint}</Text>}
	</div>
);

/** An "Add …" that picks one of `items` — a plain button when there's only one. */
const AddMenu: React.FC<{ label: string; items: { key: string; label: string }[]; onAdd: (key: string) => void }> = ({ label, items, onAdd }) => {
	if (items.length === 0) return null;
	if (items.length === 1) {
		return (
			<Button.Root variant="surface" size="sm" className="w-full justify-center" onClick={() => onAdd(items[0]!.key)}>
				<Button.Icon><Plus size={12} /></Button.Icon>
				<Button.Label>{label}</Button.Label>
			</Button.Root>
		);
	}
	return (
		<Dropdown.Root>
			<Dropdown.Trigger asChild>
				<Button.Root variant="surface" size="sm" className="w-full justify-center">
					<Button.Icon><Plus size={12} /></Button.Icon>
					<Button.Label>{label}</Button.Label>
				</Button.Root>
			</Dropdown.Trigger>
			<Dropdown.Content align="start" className="p-1!">
				{items.map(item => (
					<Dropdown.Item key={item.key} onSelect={() => onAdd(item.key)} className="text-xs! py-1.5! px-2!">{item.label}</Dropdown.Item>
				))}
			</Dropdown.Content>
		</Dropdown.Root>
	);
};

// ─── collection ─────────────────────────────────────────────────────────────

/** n8n's collection: optional fields, added one by one; its value has the ones added. */
export const CollectionField: React.FC<Editor<Record<string, unknown>> & { property: Extract<IConfigurationSchema, { type: "collection" }> }> = ({ property, value, onChange }) => {
	const fields = nestedProperties(property);
	const current = value ?? {};
	const added = fields.filter(field => propertyKey(field) in current);
	const missing = fields.filter(field => !(propertyKey(field) in current) && field.type !== "notice");
	const without = (key: string) => Object.fromEntries(Object.entries(current).filter(([found]) => found !== key));

	return (
		<div className="flex flex-col gap-2 nodrag">
			{added.length === 0 && <Text variant="low" size="xs" className="text-center py-1">No properties</Text>}
			{added.map(field => {
				const key = propertyKey(field);
				return (
					<NestedField key={key} property={field} onRemove={() => onChange(without(key))}>
						<PropertyValueEditor property={field} value={current[key]} onChange={next => onChange({ ...current, [key]: next })} />
					</NestedField>
				);
			})}
			<AddMenu
				label={property.placeholder ?? "Add option"}
				items={missing.map(field => ({ key: propertyKey(field), label: field.displayName }))}
				onAdd={key => {
					const field = fields.find(found => propertyKey(found) === key)!;
					onChange({ ...current, [key]: emptyValueOf(field) });
				}}
			/>
		</div>
	);
};

// ─── fixedCollection ────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/** A group's fields, each with its editor. */
const GroupRow: React.FC<{ fields: IConfigurationSchema[]; row: Row; onChange: (row: Row) => void; onRemove: () => void; title?: string }> = ({ fields, row, onChange, onRemove, title }) => (
	<div className="group flex items-start gap-1 rounded-md border border-line-subtle bg-field/40 p-2">
		<div className="flex flex-col gap-2 flex-1 min-w-0">
			{title && <Text variant="dim" size="xs" font="mono">{title}</Text>}
			{fields.map(field => (
				<NestedField key={propertyKey(field)} property={field}>
					<PropertyValueEditor property={field} value={row[propertyKey(field)]} onChange={next => onChange({ ...row, [propertyKey(field)]: next })} />
				</NestedField>
			))}
		</div>
		<button type="button" onClick={onRemove} className="flex items-center justify-center size-6 shrink-0 rounded-sm text-fg-muted opacity-60 group-hover:opacity-100 hover:text-danger hover:bg-hover cursor-pointer" title="Remove">
			<Trash2 size={12} />
		</button>
	</div>
);

const newRow = (fields: IConfigurationSchema[]): Row =>
	Object.fromEntries(fields.filter(field => field.type !== "notice").map(field => [propertyKey(field), emptyValueOf(field)]));

/**
 * n8n's fixedCollection: groups of fields. With `multipleValues`, each group
 * holds rows ({ group: [row, …] }), added and removed; without, a group is
 * there once or not at all ({ group: row }).
 */
export const FixedCollectionField: React.FC<Editor<Record<string, unknown>> & { property: Extract<IConfigurationSchema, { type: "fixedCollection" }> }> = ({ property, value, onChange }) => {
	const current = value ?? {};
	const groups = property.options;
	const many = !!property.multipleValues;
	const titled = groups.length > 1;
	const rowsOf = (name: string): Row[] => {
		const held = current[name];
		return Array.isArray(held) ? held as Row[] : held && typeof held === "object" ? [held as Row] : [];
	};
	const set = (name: string, rows: Row[] | Row | undefined) => {
		const next = { ...current };
		if (rows === undefined || (Array.isArray(rows) && rows.length === 0)) delete next[name];
		else next[name] = rows;
		onChange(next);
	};

	const addable = groups.filter(group => many || !(group.name in current));

	return (
		<div className="flex flex-col gap-1.5 nodrag">
			{groups.map(group => {
				const fields = nestedProperties(group);
				const rows = rowsOf(group.name);
				return rows.map((row, index) => (
					<GroupRow
						key={`${group.name}:${index}`}
						title={titled ? group.displayName : undefined}
						fields={fields}
						row={row}
						onChange={next => set(group.name, many ? rows.map((found, i) => i === index ? next : found) : next)}
						onRemove={() => set(group.name, many ? rows.filter((_, i) => i !== index) : undefined)}
					/>
				));
			})}
			{Object.keys(current).length === 0 && <Text variant="low" size="xs" className="text-center py-1">Currently no items exist</Text>}
			<AddMenu
				label={property.placeholder ?? (groups.length === 1 ? `Add ${groups[0]!.displayName}` : "Add")}
				items={addable.map(group => ({ key: group.name, label: group.displayName }))}
				onAdd={name => {
					const group = groups.find(found => found.name === name)!;
					const row = newRow(nestedProperties(group));
					set(name, many ? [...rowsOf(name), row] : row);
				}}
			/>
		</div>
	);
};

// ─── filter ─────────────────────────────────────────────────────────────────

const UNARY = new Set(LOGIC_UNARY_OPERATIONS);

/**
 * n8n's filter: conditions — a value (typed in, or an output / a variable
 * dropped on it: a pill), an operation by type, a value to compare with —
 * joined by one AND / OR.
 * The action evaluates them on the board (henglosio.sdk's matches).
 */
export const FilterField: React.FC<Editor<IFilterValueSchema>> = ({ value, onChange }) => {
	const filter: IFilterValueSchema = value ?? { combinator: "and", conditions: [] };
	const any = filter.combinator === "or";
	const setConditions = (conditions: IFilterConditionSchema[]) => onChange({ ...filter, conditions });
	const update = (id: string, change: Partial<IFilterConditionSchema>) =>
		setConditions(filter.conditions.map(condition => condition.id === id ? { ...condition, ...change } : condition));

	return (
		<div className="flex flex-col nodrag">
			{filter.conditions.map((condition, index) => (
				<div key={condition.id} className="flex flex-col">
					{index > 0 && (
						<div className="flex items-center gap-2 h-6">
							<span className="h-px flex-1 bg-line-subtle" />
							<button
								type="button"
								onClick={() => onChange({ ...filter, combinator: any ? "and" : "or" })}
								className="h-5 px-2 rounded-full border border-line bg-field font-mono text-[10px] font-semibold tracking-wide text-fg-muted hover:text-fg hover:border-accent cursor-pointer transition-colors"
								title={any ? "Any condition holds (OR) — click: all must (AND)" : "All conditions must hold (AND) — click: any one (OR)"}
							>
								{any ? "OR" : "AND"}
							</button>
							<span className="h-px flex-1 bg-line-subtle" />
						</div>
					)}
					<div className="group flex items-start gap-1 rounded-md border border-line-subtle bg-field/40 p-1">
						<span className="flex flex-col items-center pt-1.5 w-4 shrink-0 font-mono text-[10px] leading-none text-fg-muted">{index + 1}</span>
						<div className="flex flex-col gap-1 flex-1 min-w-0">
							<OperandField value={condition.leftValue} onChange={leftValue => update(condition.id, { leftValue })} placeholder="value — or drop an output here" />
							<OptionsField value={condition.operator} options={LOGIC_OPERATIONS} onChange={operator => update(condition.id, { operator })} className="w-full" />
							{!UNARY.has(condition.operator) && (
								<OperandField value={condition.rightValue} onChange={rightValue => update(condition.id, { rightValue })} placeholder="compare to" />
							)}
						</div>
						<button type="button" onClick={() => setConditions(filter.conditions.filter(found => found.id !== condition.id))} className="flex items-center justify-center size-6 shrink-0 rounded-sm text-fg-muted opacity-60 group-hover:opacity-100 hover:text-danger hover:bg-hover cursor-pointer" title={`Remove condition ${index + 1}`}>
							<Trash2 size={12} />
						</button>
					</div>
				</div>
			))}
			<Button.Root variant="surface" size="sm" className="w-full justify-center mt-1.5" onClick={() => setConditions([...filter.conditions, { id: newId(), leftValue: "", operator: "string:equals", rightValue: "" }])}>
				<Button.Icon><Plus size={12} /></Button.Icon>
				<Button.Label>Add condition</Button.Label>
			</Button.Root>
		</div>
	);
};

// ─── assignmentCollection ───────────────────────────────────────────────────

const ASSIGNMENT_TYPES: { value: IAssignmentSchema["type"]; label: string }[] = [
	{ value: "string", label: "String" },
	{ value: "number", label: "Number" },
	{ value: "boolean", label: "Boolean" },
	{ value: "array", label: "Array" },
	{ value: "object", label: "Object" },
];

/** n8n's assignmentCollection (Edit Fields): name / value pairs, each of its type — an object on the board. */
export const AssignmentCollectionField: React.FC<Editor<IAssignmentCollectionValueSchema>> = ({ value, onChange }) => {
	const assignments = value?.assignments ?? [];
	const set = (next: IAssignmentSchema[]) => onChange({ assignments: next });
	const update = (id: string, change: Partial<IAssignmentSchema>) => set(assignments.map(found => found.id === id ? { ...found, ...change } : found));

	return (
		<div className="flex flex-col gap-1.5 nodrag">
			{assignments.map(assignment => (
				<div key={assignment.id} className="group flex items-start gap-1 rounded-md border border-line-subtle bg-field/40 p-1">
					<div className="flex flex-col gap-1 flex-1 min-w-0">
						<div className="flex gap-1">
							<div className="flex-1 min-w-0">
								<TextValueField value={assignment.name} onChange={name => update(assignment.id, { name })} placeholder="name" mono />
							</div>
							<Select.Root value={assignment.type} onValueChange={type => update(assignment.id, { type: type as IAssignmentSchema["type"], value: type === "boolean" ? false : "" })} className="w-24 shrink-0">
								<Select.Trigger />
								<Select.Content>
									{ASSIGNMENT_TYPES.map(type => <Select.Item key={type.value} value={type.value}>{type.label}</Select.Item>)}
								</Select.Content>
							</Select.Root>
						</div>
						{assignment.type === "boolean"
							? <div className="flex items-center h-8"><Switch.Root checked={assignment.value === true || assignment.value === "true"} onCheckedChange={checked => update(assignment.id, { value: checked })} /></div>
							: <OperandField
								value={typeof assignment.value === "string" ? assignment.value : assignment.value === undefined ? "" : JSON.stringify(assignment.value)}
								onChange={next => update(assignment.id, { value: next })}
								placeholder={assignment.type === "array" ? "[1, 2]" : assignment.type === "object" ? '{"a": 1}' : "value — or drop an output here"}
								mono={assignment.type === "array" || assignment.type === "object"}
							/>}
					</div>
					<button type="button" onClick={() => set(assignments.filter(found => found.id !== assignment.id))} className="flex items-center justify-center size-6 shrink-0 rounded-sm text-fg-muted opacity-60 group-hover:opacity-100 hover:text-danger hover:bg-hover cursor-pointer" title="Remove">
						<Trash2 size={12} />
					</button>
				</div>
			))}
			<Button.Root variant="surface" size="sm" className="w-full justify-center" onClick={() => set([...assignments, { id: newId(), name: "", type: "string", value: "" }])}>
				<Button.Icon><Plus size={12} /></Button.Icon>
				<Button.Label>Add field</Button.Label>
			</Button.Root>
		</div>
	);
};
