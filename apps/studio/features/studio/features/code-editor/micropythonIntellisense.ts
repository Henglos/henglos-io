import type { Monaco } from "@monaco-editor/react";
import type { editor, languages } from "monaco-editor";
import type { CodeContextName } from "./codeContextNames";

// What the language server (pyright/ — basedpyright with the official
// MicroPython stubs) can't know: the names ctx.get() can read at this point of
// the workflow, and the board's own rules for a script. Everything else —
// modules, types, signatures, hover, type errors — comes from Pyright.
//
// Providers are global to the monaco namespace (not per editor), so the names
// for ctx.get() come from whichever editor is open, set via
// setCodeContextNames(). Registration is guarded to happen once per page load.

let contextNames: CodeContextName[] = [];
let variableNames: string[] = [];

export const setCodeContextNames = (names: CodeContextName[]) => {
	contextNames = names;
};

/** The workflow's variables — what `ctx.var("…")` can read. */
export const setCodeVariableNames = (names: string[]) => {
	variableNames = names;
};

// `ctx.get("par` / `ctx.var("co` — the cursor is inside the string argument.
const CTX_NAME_STRING = /ctx\.(get|var)\(\s*(["'])([^"']*)$/;

let registered = false;

export function registerCtxNameCompletion(monaco: Monaco) {

	if (registered) return;
	registered = true;

	const { CompletionItemKind } = monaco.languages;

	const provider: languages.CompletionItemProvider = {

		triggerCharacters: ["\"", "'", "/"],

		provideCompletionItems(model, position) {

			const lineBefore = model.getValueInRange({
				startLineNumber: position.lineNumber,
				startColumn: 1,
				endLineNumber: position.lineNumber,
				endColumn: position.column,
			});

			const inString = lineBefore.match(CTX_NAME_STRING);
			if (!inString) return { suggestions: [] };

			// Names contain spaces and "/", so the range is everything typed
			// since the opening quote, not just the current word.
			const typed = inString[3]!;
			const range = {
				startLineNumber: position.lineNumber,
				endLineNumber: position.lineNumber,
				startColumn: position.column - typed.length,
				endColumn: position.column,
			};

			if (inString[1] === "var") {
				return {
					suggestions: variableNames.map(name => ({
						label: name,
						kind: CompletionItemKind.Variable,
						detail: "workflow variable",
						documentation: "Kept across loops of the program — written by Variables / Set.",
						insertText: name,
						range,
					})),
				};
			}

			// ctx.get() also falls back to the workflow variables (the run's
			// values win a tie — a variable shadowed by one isn't offered).
			const shadowed = new Set(contextNames.map(entry => entry.name.toLowerCase()));
			return {
				suggestions: [
					...contextNames.map(entry => ({
						label: entry.name,
						kind: entry.kind === "config" ? CompletionItemKind.Property : CompletionItemKind.Value,
						detail: entry.detail,
						documentation: entry.kind === "config"
							? "One of this action's configs."
							: "Output published by an action that runs before this one.",
						insertText: entry.name,
						range,
					})),
					...variableNames.filter(name => !shadowed.has(name.toLowerCase())).map(name => ({
						label: name,
						kind: CompletionItemKind.Variable,
						detail: "workflow variable",
						documentation: "Kept across loops of the program — written by Variables / Set.",
						insertText: name,
						range,
					})),
				],
			};
		},
	};

	monaco.languages.registerCompletionItemProvider("python", provider);
}

const MARKER_OWNER = "hio-micropython";

export type ScriptRules = {
	/** A CODE binding computes a value, so it must return; the Code node's script may not. */
	requireReturn: boolean;
	/** UTF-8 bytes the board accepts — longer won't compile into the workflow. */
	maxBytes: number;
};

export const utf8Length = (text: string) => new TextEncoder().encode(text).length;

/**
 * Flags what the board would reject (ScriptEngine.py / the Code node's run.py
 * only log it or go out Fallback): no `return` where one is needed, writing
 * through ctx (read-only), ctx.get() names that don't exist at this point of
 * the workflow, and a script over the size the board accepts.
 */
export function validateMicropythonScript(monaco: Monaco, model: editor.ITextModel, rules: ScriptRules) {

	const markers: editor.IMarkerData[] = [];
	const source = model.getValue();
	const lines = source.split("\n");

	const bytes = utf8Length(source);
	if (bytes > rules.maxBytes) {
		const last = model.getLineCount();
		markers.push({
			severity: monaco.MarkerSeverity.Error,
			message: `${bytes} bytes — the board accepts up to ${rules.maxBytes}. The workflow won't compile until it's shorter.`,
			startLineNumber: 1, startColumn: 1, endLineNumber: last, endColumn: model.getLineMaxColumn(last),
		});
	}

	const meaningful = lines.some(line => line.trim() !== "" && !line.trim().startsWith("#"));
	if (rules.requireReturn && meaningful && !/^\s*return\b/m.test(source)) {
		markers.push({
			severity: monaco.MarkerSeverity.Warning,
			message: "The script needs a `return <value>` — without one the config is dropped on the device.",
			startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: (lines[0]?.length ?? 0) + 1,
		});
	}

	// What ctx.get() can find: the run's values, then the workflow variables.
	const known = new Set([...contextNames.map(entry => entry.name), ...variableNames.map(name => name.toLowerCase())]);

	lines.forEach((line, index) => {
		for (const match of line.matchAll(/ctx\.(set|publish)\b/g)) {
			markers.push({
				severity: monaco.MarkerSeverity.Error,
				message: "ctx is read-only in a Code script — return the value instead.",
				startLineNumber: index + 1, startColumn: match.index! + 1,
				endLineNumber: index + 1, endColumn: match.index! + match[0].length + 1,
			});
		}

		for (const match of line.matchAll(/ctx\.var\(\s*(["'])([^"']*)\1/g)) {
			const name = match[2]!;
			if (variableNames.some(known => known.toLowerCase() === name.toLowerCase())) continue;
			const start = match.index! + match[0].indexOf(name);
			markers.push({
				severity: monaco.MarkerSeverity.Warning,
				message: variableNames.length
					? `There's no variable "${name}" — ctx.var() will return None. Variables: ${variableNames.join(", ")}`
					: `There's no variable "${name}" — create it in the Variables list (under Components).`,
				startLineNumber: index + 1, startColumn: start + 1,
				endLineNumber: index + 1, endColumn: start + name.length + 1,
			});
		}

		for (const match of line.matchAll(/ctx\.get\(\s*(["'])([^"']*)\1/g)) {
			const name = match[2]!;
			if (known.size === 0 || known.has(name.toLowerCase())) continue;
			const start = match.index! + match[0].indexOf(name);
			markers.push({
				severity: monaco.MarkerSeverity.Warning,
				message: `"${name}" isn't available here — ctx.get() will return None. Expected one of: ${[...known].join(", ")}`,
				startLineNumber: index + 1, startColumn: start + 1,
				endLineNumber: index + 1, endColumn: start + name.length + 1,
			});
		}
	});

	monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
}
