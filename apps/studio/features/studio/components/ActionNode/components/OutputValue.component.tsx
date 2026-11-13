import { useState } from "react";
import { Switch, Text } from "@henglosio/ui";
import { Check, Copy, Pencil, X } from "lucide-react";
import clsx from "clsx";
import type { DebugValue, RunActionResult } from "@/shared/api";
import { useBindDraggable } from "@/features/studio/lib/bindDrag";

// What a ▶ run or a debug step of an action published, shown in the node
// itself — under each output's row, so a value sits next to the output it
// belongs to and moves with the node. Long names and values wrap; a big
// value scrolls inside its box.

export type RunValue = RunActionResult["values"][number];

/** Debug mode: write `value` over what the action published; resolves whether it took. */
export type EditValue = (value: DebugValue, display: RunValue["value"]) => Promise<boolean>;

type RunSummaryProps = {
	/** What ran it: "Ran alone" (▶), "Debug · step 3"… */
	title: string;
	output: RunActionResult["output"];
	ranAt: Date;
	/** Absent while the debugger holds it (it goes on the next step). */
	onClose?: () => void;
};

/** The line above the outputs: how the action ran, the output it ended on, when. */
export const RunSummary: React.FC<RunSummaryProps> = ({ title, output, ranAt, onClose }) => {
	const fallback = output.name === "Fallback";
	return (
		<div className="nodrag flex items-center gap-2 px-2 py-1.5 bg-field border-b border-line-subtle">
			<span className={clsx("size-1.5 shrink-0 rounded-full", fallback ? "bg-danger" : "bg-accent")} />
			<Text variant="dim" size="xs" className="truncate">
				{title} → <span className={clsx("font-mono", fallback ? "text-danger" : "text-fg")}>{output.name}</span>
			</Text>
			<Text variant="low" size="xs" className="ml-auto shrink-0 tabular-nums">{ranAt.toLocaleTimeString()}</Text>
			{onClose && (
				<button type="button" onClick={onClose} className="shrink-0 cursor-pointer text-fg-muted hover:text-fg" title="Clear">
					<X size={11} />
				</button>
			)}
		</div>
	);
};

const hex = (bytes: number[]) => bytes.map(byte => byte.toString(16).padStart(2, "0")).join(" ");

// A list or an object the action declared (outputSchema shape) — not a byte array.
const isStructured = (value: RunValue) =>
	!!value.type && (value.type.startsWith("list of") || value.type.startsWith("{"));

const display = (value: RunValue) =>
	isStructured(value) ? JSON.stringify(value.value, null, 2)
	: Array.isArray(value.value) ? `[${value.value.join(", ")}]`
	: typeof value.value === "string" ? value.value
	: String(value.value);

// How a value is written back (CONTEXT_SET) — the shape it came in as; a
// number is a float when it was declared one or isn't whole.
const kindOf = (value: RunValue): DebugValue["kind"] =>
	isStructured(value) ? (Array.isArray(value.value) ? "list" : "object")
	: typeof value.value === "boolean" ? "bool"
	: typeof value.value === "string" ? "string"
	: Array.isArray(value.value) ? "bytes"
	: value.type?.includes("float") || !Number.isInteger(value.value) ? "float"
	: "integer";

type OutputValueProps = {
	value: RunValue;
	/** Shown as the label — for a value no output row declares. */
	showName?: boolean;
	onEdit?: EditValue;
	busy?: boolean;
	/** The declared output it belongs to: its table's rows and cells then drag with their own index. */
	source?: DragSource;
};

/** The output a table's rows and cells are read from. */
type DragSource = { actionId: string; outputName: string };
type Path = (string | number)[];

/** One published value, under its output's row. */
export const OutputValue: React.FC<OutputValueProps> = ({ value, showName, onEdit, busy, source }) => {

	// Text and byte arrays can also be read as the raw bytes the board sent; a
	// list or an object as a table, or as the JSON it came in.
	const structured = isStructured(value);
	const hasRaw = !structured && (typeof value.value === "string" || Array.isArray(value.value));
	const [raw, setRaw] = useState(false);
	const [copied, setCopied] = useState(false);
	const [editing, setEditing] = useState(false);

	const shown = raw ? (structured ? display(value) : hex(value.bytes)) : display(value);
	const modes = structured ? [["Table", false], ["JSON", true]] as const : [["Value", false], ["Hex", true]] as const;

	const copy = async () => {
		await navigator.clipboard.writeText(shown);
		setCopied(true);
		setTimeout(() => setCopied(false), 1200);
	};

	return (

		<div className="nodrag nowheel flex flex-col mx-2 mb-2 rounded-md border border-line-subtle bg-field overflow-hidden">

			<div className="flex items-center gap-2 px-2 h-6 border-b border-line-subtle">
				{showName && <Text variant="dim" size="xs" font="mono" className="break-all">{value.name}</Text>}
				<Text variant="low" size="xs" font="mono" className="shrink-0">{value.bytes.length} B</Text>

				{structured && (
					<Text variant="low" size="xs" font="mono" className="shrink-0">{countLabel(value.value)}</Text>
				)}

				{(hasRaw || structured) && !editing && (
					<div className="flex gap-0.5">
						{modes.map(([label, isRaw]) => (
							<button
								key={label}
								type="button"
								onClick={() => setRaw(isRaw)}
								className={clsx("px-1.5 h-4 rounded-sm text-[10px] cursor-pointer transition-colors", raw === isRaw ? "bg-active text-fg" : "text-fg-muted hover:text-fg")}
							>
								{label}
							</button>
						))}
					</div>
				)}

				<div className="ml-auto flex items-center gap-1.5">
					{onEdit && !editing && (
						<button type="button" onClick={() => setEditing(true)} disabled={busy} className="cursor-pointer text-fg-muted hover:text-fg disabled:opacity-40" title="Edit — the next action reads the new value">
							<Pencil size={11} />
						</button>
					)}
					<button type="button" onClick={copy} className="cursor-pointer text-fg-muted hover:text-fg" title="Copy">
						{copied ? <Check size={11} className="text-accent-fg" /> : <Copy size={11} />}
					</button>
				</div>
			</div>

			{editing && onEdit ? (
				<ValueEditor value={value} busy={busy} onCancel={() => setEditing(false)} onApply={async (next, shownValue) => {
					if (await onEdit(next, shownValue)) setEditing(false);
				}} />
			) : structured && !raw ? (
				<div className="max-h-48 overflow-auto select-text">
					<StructuredView value={value.value} source={source} />
				</div>
			) : (
				<pre className="m-0 px-2 py-1.5 max-h-32 overflow-auto font-mono text-xs text-fg whitespace-pre-wrap break-all select-text">{shown}</pre>
			)}

		</div>

	);

};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);

const countLabel = (value: unknown) =>
	Array.isArray(value) ? `${value.length} ${value.length === 1 ? "item" : "items"}`
	: isRecord(value) ? `${Object.keys(value).length} fields`
	: "";

// A value inside a cell: a scalar as itself, text quoted only when empty, a
// nested list or object as compact JSON.
const Cell: React.FC<{ value: unknown }> = ({ value }) => {
	if (value === null || value === undefined) return <span className="text-fg-muted">—</span>;
	if (typeof value === "string") return value === "" ? <span className="text-fg-muted">""</span> : <>{value}</>;
	if (typeof value === "boolean") return <span className={value ? "text-accent-fg" : "text-fg-muted"}>{String(value)}</span>;
	if (typeof value === "object") return <span className="text-fg-secondary">{JSON.stringify(value)}</span>;
	return <span className="tabular-nums">{String(value)}</span>;
};

const cellClass = "px-2 py-1 border-b border-line-subtle text-left align-top whitespace-nowrap";

type DragCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & { source?: DragSource; path: Path };

// A cell that drags what it shows onto a config, or into the code editor — read
// from its own item by index ("entries" [3, "size"]). Plain without a source.
const DragCell: React.FC<DragCellProps> = ({ source, path, className, children, ...props }) => {
	const { bind, isDragging } = useBindDraggable(
		`cell:${source?.actionId}:${source?.outputName}:${path.join(".")}`,
		{ kind: "field", actionId: source?.actionId ?? "", outputName: source?.outputName ?? "", path },
	);
	if (!source) return <td {...props} className={className}>{children}</td>;
	return (
		<td
			{...props}
			{...bind}
			title="Drag onto a config (a Code binding reading it) or into the code editor"
			className={clsx(className, "cursor-grab outline-none hover:bg-active", isDragging && "opacity-50")}
		>
			{children}
		</td>
	);
};

// A list or an object, readable: a list of objects as a table (a column per
// field, a row per item), a list of anything else as numbered rows, an object
// as its fields and values.
const StructuredView: React.FC<{ value: unknown; source?: DragSource }> = ({ value, source }) => {

	if (Array.isArray(value)) {
		if (value.length === 0) return <Text variant="low" size="xs" className="block px-2 py-1.5">Empty list</Text>;

		const columns = value.every(isRecord)
			? [...new Set(value.flatMap(item => Object.keys(item)))]
			: null;

		return (
			<table className="w-full border-collapse font-mono text-xs text-fg">
				<thead className="sticky top-0 bg-raised">
					<tr>
						<th className={clsx(cellClass, "w-0 font-normal text-fg-muted")}>#</th>
						{columns
							? columns.map(column => <th key={column} className={clsx(cellClass, "font-normal text-fg-secondary")}>{column}</th>)
							: <th className={clsx(cellClass, "font-normal text-fg-secondary")}>value</th>}
					</tr>
				</thead>
				<tbody>
					{value.map((item, index) => (
						<tr key={index} className="hover:bg-hover">
							{/* The index drags the whole item; a cell, its field of it. */}
							<DragCell source={source} path={[index]} className={clsx(cellClass, "text-fg-muted tabular-nums")}>{index}</DragCell>
							{columns
								? columns.map(column => <DragCell key={column} source={source} path={[index, column]} className={cellClass}><Cell value={(item as Record<string, unknown>)[column]} /></DragCell>)
								: <DragCell source={source} path={[index]} className={cellClass}><Cell value={item} /></DragCell>}
						</tr>
					))}
				</tbody>
			</table>
		);
	}

	if (isRecord(value)) {
		return (
			<table className="w-full border-collapse font-mono text-xs text-fg">
				<tbody>
					{Object.entries(value).map(([field, inner]) => (
						<tr key={field} className="hover:bg-hover">
							<DragCell source={source} path={[field]} className={clsx(cellClass, "w-0 text-fg-secondary")}>{field}</DragCell>
							<DragCell source={source} path={[field]} className={clsx(cellClass, "whitespace-normal break-all")}><Cell value={inner} /></DragCell>
						</tr>
					))}
				</tbody>
			</table>
		);
	}

	return <div className="px-2 py-1.5 font-mono text-xs text-fg"><Cell value={value} /></div>;

};

type ValueEditorProps = {
	value: RunValue;
	busy?: boolean;
	onCancel: () => void;
	onApply: (value: DebugValue, display: RunValue["value"]) => void;
};

// Debug mode's edit of one published value, in the shape it came in: a
// switch, a number, text, or bytes as hex.
const ValueEditor: React.FC<ValueEditorProps> = ({ value, busy, onCancel, onApply }) => {

	const kind = kindOf(value);
	const json = kind === "list" || kind === "object";
	const [flag, setFlag] = useState(value.value === true);
	const [text, setText] = useState(
		kind === "bytes" ? hex(value.bytes) : json ? JSON.stringify(value.value, null, 2) : kind === "bool" ? "" : String(value.value),
	);

	const parsed = ((): { value: DebugValue; display: RunValue["value"] } | string => {
		switch (kind) {
			case "bool": return { value: { name: value.name, kind, value: flag }, display: flag };
			case "string": return { value: { name: value.name, kind, value: text }, display: text };
			case "integer": {
				if (!/^-?\d+$/.test(text.trim())) return "A whole number.";
				const number = Number(text);
				if (number < -0x80000000 || number > 0x7fffffff) return "Out of an integer's range.";
				return { value: { name: value.name, kind, value: number }, display: number };
			}
			case "float": {
				const number = Number(text.trim());
				if (text.trim() === "" || !Number.isFinite(number)) return "A number.";
				return { value: { name: value.name, kind, value: number }, display: number };
			}
			case "bytes": {
				const parts = text.trim().split(/[\s,]+/).filter(Boolean);
				if (!parts.every(part => /^[0-9a-fA-F]{1,2}$/.test(part))) return "Bytes as hex — 01 ff 20.";
				const bytes = parts.map(part => parseInt(part, 16));
				return { value: { name: value.name, kind, value: bytes }, display: bytes };
			}
			case "list":
			case "object": {
				try {
					const parsed = JSON.parse(text) as unknown;
					if (kind === "list") {
						if (!Array.isArray(parsed)) return "A list, as JSON.";
						return { value: { name: value.name, kind, value: parsed }, display: parsed };
					}
					if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "An object, as JSON.";
					const object = parsed as Record<string, unknown>;
					return { value: { name: value.name, kind, value: object }, display: object };
				} catch {
					return "Not valid JSON.";
				}
			}
		}
	})();

	const error = typeof parsed === "string" ? parsed : null;

	return (
		<div className="flex flex-col gap-1.5 px-2 py-1.5">
			{kind === "bool" ? (
				<div className="flex items-center gap-2">
					<Switch.Root checked={flag} onCheckedChange={setFlag} />
					<Text variant="dim" size="xs" font="mono">{flag ? "true" : "false"}</Text>
				</div>
			) : (
				<textarea
					autoFocus
					value={text}
					onChange={e => setText(e.target.value)}
					rows={json ? 6 : kind === "string" || kind === "bytes" ? 3 : 1}
					className="w-full resize-y rounded-sm border border-line bg-raised px-1.5 py-1 font-mono text-xs text-fg outline-none focus:border-accent-line"
				/>
			)}
			{error && <Text variant="low" size="xs" className="text-danger!">{error}</Text>}
			<div className="flex justify-end gap-1">
				<button type="button" onClick={onCancel} className="px-2 h-5 rounded-sm text-xs cursor-pointer text-fg-muted hover:text-fg">Cancel</button>
				<button
					type="button"
					disabled={!!error || busy}
					onClick={() => { if (typeof parsed !== "string") onApply(parsed.value, parsed.display); }}
					className="px-2 h-5 rounded-sm text-xs cursor-pointer bg-accent text-on-accent disabled:opacity-40"
				>
					{busy ? "Applying…" : "Apply"}
				</button>
			</div>
		</div>
	);

};
