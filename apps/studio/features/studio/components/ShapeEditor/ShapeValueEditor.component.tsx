import { useEffect, useRef, useState } from "react";
import { Input, Switch, Text } from "@henglosio/ui";
import { emptyShapeValue, isListShape, isObjectShape, validateShape, type IShape } from "@henglosio/workflow";
import clsx from "clsx";
import Editor from "@monaco-editor/react";
import { defineHenglosMonacoTheme, HENGLOS_MONACO_THEME } from "@/features/studio/features/code-editor/henglosMonacoTheme";

type ShapeValueEditorProps = {
	shape: IShape;
	value: unknown;
	onChange: (value: unknown) => void;
	/** A list's — no Add past it. */
	maxItems?: number;
	/** An object's fields as the user reads them (a config's displayNames) — the field name otherwise. */
	labels?: Record<string, string>;
	/** Nesting, for the inner editors. */
	depth?: number;
};

/**
 * Edits a value of a shape: a list or object in text via Monaco Editor (styled like a textarea),
 * or a scalar as its field.
 */
export const ShapeValueEditor: React.FC<ShapeValueEditorProps> = ({ shape, value, onChange, maxItems, depth = 0 }) => {

	if (isListShape(shape) || isObjectShape(shape)) {
		return <JsonEditor shape={shape} value={value} onChange={onChange} maxItems={maxItems} />;
	}

	const problem = depth === 0 ? validateShape(shape, value ?? emptyShapeValue(shape)) : null;

	return (
		<div className="flex flex-col gap-1.5 w-full nodrag">
			<ScalarEditor kind={shape} value={value} onChange={onChange} />
			{problem && <Text variant="low" size="xs" className="text-danger!">{problem}</Text>}
		</div>
	);

};

const serialize = (val: unknown) => {
	try {
		return JSON.stringify(val ?? null);
	} catch {
		return "";
	}
};

const formatInitial = (val: unknown, shp: IShape) => {
	try {
		return JSON.stringify(val ?? emptyShapeValue(shp), null, 2);
	} catch {
		return "";
	}
};

type JsonEditorProps = {
	shape: IShape;
	value: unknown;
	onChange: (value: unknown) => void;
	maxItems?: number;
};

// Edits a list or object value as JSON text in Monaco Editor styled like a textarea.
export const JsonEditor: React.FC<JsonEditorProps> = ({ shape, value, onChange, maxItems }) => {

	const [text, setText] = useState(() => formatInitial(value, shape));
	const [error, setError] = useState<string | null>(() => {
		const initialVal = value ?? emptyShapeValue(shape);
		let problem = validateShape(shape, initialVal);
		if (!problem && maxItems !== undefined && Array.isArray(initialVal) && initialVal.length > maxItems) {
			problem = `At most ${maxItems} ${maxItems === 1 ? "item" : "items"} (has ${initialVal.length})`;
		}
		return problem;
	});

	// Tracks what was last committed from typing to prevent overwriting local draft or cursor position.
	const lastCommittedRef = useRef<string>(serialize(value));

	useEffect(() => {
		const serialized = serialize(value);
		if (serialized !== lastCommittedRef.current) {
			lastCommittedRef.current = serialized;
			const formatted = formatInitial(value, shape);
			setText(formatted);
			try {
				const parsed = JSON.parse(formatted) as unknown;
				let problem = validateShape(shape, parsed);
				if (!problem && maxItems !== undefined && Array.isArray(parsed) && parsed.length > maxItems) {
					problem = `At most ${maxItems} ${maxItems === 1 ? "item" : "items"} (has ${parsed.length})`;
				}
				setError(problem);
			} catch {
				setError("Not valid JSON yet.");
			}
		}
	}, [value, shape, maxItems]);

	const handleEditorChange = (nextText: string | undefined) => {
		const content = nextText ?? "";
		setText(content);
		try {
			const parsed = JSON.parse(content) as unknown;
			let problem = validateShape(shape, parsed);
			if (!problem && maxItems !== undefined && Array.isArray(parsed) && parsed.length > maxItems) {
				problem = `At most ${maxItems} ${maxItems === 1 ? "item" : "items"} (has ${parsed.length})`;
			}
			setError(problem);
			if (!problem) {
				lastCommittedRef.current = serialize(parsed);
				onChange(parsed);
			}
		} catch {
			setError("Not valid JSON yet.");
		}
	};

	return (
		<div className="flex flex-col gap-1 w-full nodrag nowheel">
			<div
				className={clsx(
					"w-full h-32 min-h-20 resize-y overflow-hidden rounded-md border transition-[border-color,box-shadow]",
					error
						? "border-danger ring-1 ring-danger"
						: "border-line focus-within:border-accent focus-within:ring-1 focus-within:ring-accent",
					"bg-[#0c0c0e]",
				)}
			>
				<Editor
					height="100%"
					width="100%"
					language="json"
					theme={HENGLOS_MONACO_THEME}
					beforeMount={defineHenglosMonacoTheme}
					value={text}
					onChange={handleEditorChange}
					loading={null}
					options={{
						minimap: { enabled: false },
						lineNumbers: "off",
						glyphMargin: false,
						folding: false,
						lineDecorationsWidth: 8,
						lineNumbersMinChars: 0,
						renderLineHighlight: "none",
						overviewRulerLanes: 0,
						hideCursorInOverviewRuler: true,
						overviewRulerBorder: false,
						scrollbar: {
							vertical: "auto",
							horizontal: "auto",
							verticalScrollbarSize: 6,
							horizontalScrollbarSize: 6,
						},
						scrollBeyondLastLine: false,
						automaticLayout: true,
						wordWrap: "on",
						fontSize: 12,
						lineHeight: 18,
						tabSize: 2,
						padding: { top: 8, bottom: 8 },
						fixedOverflowWidgets: true,
						formatOnPaste: true,
					}}
				/>
			</div>
			{error && <Text variant="low" size="xs" className="text-danger!">{error}</Text>}
		</div>
	);

};

// One scalar: a string, a number (kept as typed until it reads as one), a bool.
const ScalarEditor: React.FC<{ kind: IShape; value: unknown; onChange: (value: unknown) => void }> = ({ kind, value, onChange }) => {

	const isText = kind === "string";
	const isInteger = kind === "integer";
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
