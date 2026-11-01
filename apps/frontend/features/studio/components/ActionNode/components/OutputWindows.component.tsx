import { useLayoutEffect, useState } from "react";
import { NodeToolbar, Position, useStore } from "@xyflow/react";
import { Switch, Text } from "@henglosio/ui";
import { Check, Copy, Pencil, X } from "lucide-react";
import clsx from "clsx";
import type { DebugValue, RunActionResult } from "@/shared/api";

type RunValue = RunActionResult["values"][number];

/** Debug mode: write `value` over what the action published; resolves whether it took. */
export type EditValue = (value: DebugValue, display: RunValue["value"]) => Promise<boolean>;

const GAP = 12;

type OutputWindowsProps = {
	output: RunActionResult["output"];
	values: RunValue[];
	/** What ran it: "Ran alone" (▶), "Debug · step 3"… */
	title: string;
	/** When the action ran, for the header. */
	ranAt: Date;
	/** Debug mode: the values can be edited — written on the board before the next step. */
	onEdit?: EditValue;
	busy?: boolean;
	/** The node's right-hand ports column — the windows start past its labels. */
	portsRef: React.RefObject<HTMLDivElement | null>;
	onClose: () => void;
};

/**
 * What a ▶ run of an action published: one window per output value, stacked
 * beside the node — long names and values get room to wrap instead of being
 * cut in the node. A NodeToolbar, so they follow the node as it's dragged and
 * the canvas zooms, at screen size (readable at any zoom).
 */
export const OutputWindows: React.FC<OutputWindowsProps> = ({ output, values, title, ranAt, onEdit, busy, portsRef, onClose }) => {

	// Past the output labels, which hang outside the card: their width is in
	// flow units, the toolbar's offset in screen pixels.
	const zoom = useStore(state => state.transform[2]);
	const [portsWidth, setPortsWidth] = useState(0);
	useLayoutEffect(() => {
		const node = portsRef.current;
		if (!node) return;
		const observer = new ResizeObserver(() => setPortsWidth(node.offsetWidth));
		observer.observe(node);
		setPortsWidth(node.offsetWidth);
		return () => observer.disconnect();
	}, [portsRef]);

	const [closed, setClosed] = useState<Set<string>>(new Set());
	const open = values.filter(value => !closed.has(value.name));
	const fallback = output.name === "Fallback";

	return (

		<NodeToolbar isVisible position={Position.Right} align="start" offset={portsWidth * zoom + GAP}>
			<div className="nodrag nowheel flex flex-col gap-2 w-72">

				<div className="flex items-center gap-2 px-3 h-8 rounded-lg border border-line bg-raised shadow-[0_4px_16px_rgb(0_0_0/0.3)]">
					<span className={clsx("size-1.5 shrink-0 rounded-full", fallback ? "bg-danger" : "bg-accent")} />
					<Text variant="dim" size="xs" className="truncate">
						{title} → <span className={clsx("font-mono", fallback ? "text-danger" : "text-fg")}>{output.name}</span>
					</Text>
					<Text variant="low" size="xs" className="ml-auto shrink-0 tabular-nums">{ranAt.toLocaleTimeString()}</Text>
					<button type="button" onClick={onClose} className="shrink-0 cursor-pointer text-fg-muted hover:text-fg" title="Close all">
						<X size={12} />
					</button>
				</div>

				{values.length === 0 && (
					<div className="px-3 py-2 rounded-lg border border-line bg-raised">
						<Text variant="low" size="xs">It published no values.</Text>
					</div>
				)}

				{open.map(value => (
					<OutputWindow
						key={value.name}
						value={value}
						onEdit={onEdit}
						busy={busy}
						onClose={() => setClosed(prev => new Set(prev).add(value.name))}
					/>
				))}

			</div>
		</NodeToolbar>

	);

};

const hex = (bytes: number[]) => bytes.map(byte => byte.toString(16).padStart(2, "0")).join(" ");

const display = (value: RunValue["value"]) =>
	Array.isArray(value) ? `[${value.join(", ")}]` : typeof value === "string" ? value : String(value);

// How a value is written back (CONTEXT_SET) — the shape it came in as; a
// number is a float when it was declared one or isn't whole.
const kindOf = (value: RunValue): DebugValue["kind"] =>
	typeof value.value === "boolean" ? "bool"
	: typeof value.value === "string" ? "text"
	: Array.isArray(value.value) ? "bytes"
	: value.type?.includes("float") || !Number.isInteger(value.value) ? "float"
	: "int";

const OutputWindow: React.FC<{ value: RunValue; onEdit?: EditValue; busy?: boolean; onClose: () => void }> = ({ value, onEdit, busy, onClose }) => {

	// Text and byte arrays can also be read as the raw bytes the board sent.
	const hasRaw = typeof value.value === "string" || Array.isArray(value.value);
	const [raw, setRaw] = useState(false);
	const [copied, setCopied] = useState(false);
	const [editing, setEditing] = useState(false);

	const shown = raw ? hex(value.bytes) : display(value.value);

	const copy = async () => {
		await navigator.clipboard.writeText(shown);
		setCopied(true);
		setTimeout(() => setCopied(false), 1200);
	};

	return (

		<div className="flex flex-col rounded-lg border border-line bg-raised shadow-[0_4px_16px_rgb(0_0_0/0.3)] overflow-hidden">

			<div className="flex items-start gap-2 px-3 py-2 border-b border-line-subtle">
				<div className="flex flex-col min-w-0 flex-1">
					<Text variant="high" size="sm" font="mono" className="break-all">{value.name}</Text>
					<Text variant="low" size="xs" font="mono">
						{value.type ?? "undeclared"} · {value.bytes.length} byte{value.bytes.length === 1 ? "" : "s"}
					</Text>
				</div>
				{onEdit && !editing && (
					<button type="button" onClick={() => setEditing(true)} disabled={busy} className="shrink-0 mt-0.5 cursor-pointer text-fg-muted hover:text-fg disabled:opacity-40" title="Edit — the next action reads the new value">
						<Pencil size={12} />
					</button>
				)}
				<button type="button" onClick={copy} className="shrink-0 mt-0.5 cursor-pointer text-fg-muted hover:text-fg" title="Copy">
					{copied ? <Check size={12} className="text-accent-fg" /> : <Copy size={12} />}
				</button>
				<button type="button" onClick={onClose} className="shrink-0 mt-0.5 cursor-pointer text-fg-muted hover:text-fg" title="Close">
					<X size={12} />
				</button>
			</div>

			{editing && onEdit ? (
				<ValueEditor value={value} busy={busy} onCancel={() => setEditing(false)} onApply={async (next, display) => {
					if (await onEdit(next, display)) setEditing(false);
				}} />
			) : (
				<pre className="m-0 px-3 py-2 max-h-48 overflow-auto font-mono text-sm text-fg whitespace-pre-wrap break-all">{shown}</pre>
			)}

			{hasRaw && !editing && (
				<div className="flex gap-1 px-3 pb-2">
					{[["Value", false], ["Hex", true]].map(([label, isRaw]) => (
						<button
							key={String(label)}
							type="button"
							onClick={() => setRaw(isRaw as boolean)}
							className={clsx(
								"px-2 h-5 rounded-sm text-xs cursor-pointer transition-colors",
								raw === isRaw ? "bg-active text-fg" : "text-fg-muted hover:text-fg",
							)}
						>
							{label}
						</button>
					))}
				</div>
			)}

		</div>

	);

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
	const [flag, setFlag] = useState(value.value === true);
	const [text, setText] = useState(
		kind === "bytes" ? hex(value.bytes) : kind === "bool" ? "" : String(value.value),
	);

	const parsed = ((): { value: DebugValue; display: RunValue["value"] } | string => {
		switch (kind) {
			case "bool": return { value: { name: value.name, kind, value: flag }, display: flag };
			case "text": return { value: { name: value.name, kind, value: text }, display: text };
			case "int": {
				if (!/^-?\d+$/.test(text.trim())) return "A whole number.";
				const number = Number(text);
				if (number < -0x80000000 || number > 0x7fffffff) return "Out of int32 range.";
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
			// kindOf here never gives it — lists / objects are edited in OutputValue.
			case "json":
				return "Not editable here.";
		}
	})();

	const error = typeof parsed === "string" ? parsed : null;

	return (
		<div className="flex flex-col gap-2 px-3 py-2">
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
					rows={kind === "text" || kind === "bytes" ? 3 : 1}
					className="w-full resize-y rounded-md border border-line bg-field px-2 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent-line"
				/>
			)}
			{error && <Text variant="low" size="xs" className="text-danger!">{error}</Text>}
			<div className="flex justify-end gap-1">
				<button type="button" onClick={onCancel} className="px-2 h-6 rounded-sm text-xs cursor-pointer text-fg-muted hover:text-fg">Cancel</button>
				<button
					type="button"
					disabled={!!error || busy}
					onClick={() => { if (typeof parsed !== "string") onApply(parsed.value, parsed.display); }}
					className="px-2 h-6 rounded-sm text-xs cursor-pointer bg-accent text-on-accent disabled:opacity-40"
				>
					{busy ? "Applying…" : "Apply"}
				</button>
			</div>
		</div>
	);

};
