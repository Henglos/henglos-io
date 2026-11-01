import type { Monaco } from "@monaco-editor/react";
import type { editor, IMarkdownString, IRange, languages, Position as MonacoPosition } from "monaco-editor";
import type {
	CompletionItem,
	Diagnostic,
	Hover,
	MarkedString,
	MarkupContent,
	Position,
	Range,
} from "vscode-languageserver-protocol";
import { getPyrightClient, ROOT_URI, type PyrightClient } from "./pyrightClient";

// Monaco ↔ Pyright for the code editor's scripts.
//
// A script isn't a module: the board runs it as a function body —
// ScriptEngine.py / the Code node's run.py prepend `def _hio_code(ctx):`,
// indent every line by one space and append ` pass`. Pyright gets that exact
// shape (plus a typed `ctx`), so a bare `return` is valid, `ctx` is known and
// what it reports matches what the device would run. Positions are shifted
// between the editor's text and that wrapped document.

const HEADER = [
	"from _hio_ctx import Context",
	"def _hio_code(ctx: Context):",
];
const INDENT = 1;

export const wrapScript = (source: string) =>
	`${HEADER.join("\n")}\n${source.split("\n").map(line => " ".repeat(INDENT) + line).join("\n")}\n${" ".repeat(INDENT)}pass\n`;

const toLsp = (position: MonacoPosition): Position => ({
	line: position.lineNumber - 1 + HEADER.length,
	character: position.column - 1 + INDENT,
});

const fromLsp = (position: Position) => ({
	lineNumber: position.line - HEADER.length + 1,
	column: Math.max(1, position.character - INDENT + 1),
});

const rangeFromLsp = (range: Range): IRange => {
	const start = fromLsp(range.start);
	const end = fromLsp(range.end);
	return { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
};

type Attached = { uri: string; version: number; lineCount: number };

// Editor model URI → its document on the server.
const attached = new Map<string, Attached>();
let nextDocument = 0;

const markdown = (content: MarkupContent | MarkedString | string): IMarkdownString =>
	typeof content === "string"
		? { value: content }
		: "kind" in content
			? { value: content.kind === "markdown" ? content.value : escapeMarkdown(content.value) }
			: { value: `\`\`\`${content.language}\n${content.value}\n\`\`\`` };

const escapeMarkdown = (text: string) => text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, "\\$&");

const hoverContents = (hover: Hover): IMarkdownString[] =>
	Array.isArray(hover.contents) ? hover.contents.map(markdown) : [markdown(hover.contents)];

let registered = false;

/** Registers the Pyright-backed providers for "python" — once per page. */
export function registerPyrightProviders(monaco: Monaco) {

	if (registered) return;
	registered = true;

	const { CompletionItemKind, CompletionItemInsertTextRule, CompletionItemTag } = monaco.languages;

	// LSP CompletionItemKind (1-based) → Monaco's.
	const KINDS = [
		CompletionItemKind.Text, CompletionItemKind.Text, CompletionItemKind.Method, CompletionItemKind.Function,
		CompletionItemKind.Constructor, CompletionItemKind.Field, CompletionItemKind.Variable, CompletionItemKind.Class,
		CompletionItemKind.Interface, CompletionItemKind.Module, CompletionItemKind.Property, CompletionItemKind.Unit,
		CompletionItemKind.Value, CompletionItemKind.Enum, CompletionItemKind.Keyword, CompletionItemKind.Snippet,
		CompletionItemKind.Color, CompletionItemKind.File, CompletionItemKind.Reference, CompletionItemKind.Folder,
		CompletionItemKind.EnumMember, CompletionItemKind.Constant, CompletionItemKind.Struct, CompletionItemKind.Event,
		CompletionItemKind.Operator, CompletionItemKind.TypeParameter,
	];

	// The original LSP item rides along, for completionItem/resolve.
	type PyrightCompletion = languages.CompletionItem & { lsp: CompletionItem };

	const toCompletion = (item: CompletionItem, fallbackRange: IRange): PyrightCompletion => {
		const edit = item.textEdit;
		const range = edit
			? "range" in edit
				? rangeFromLsp(edit.range)
				: { insert: rangeFromLsp(edit.insert), replace: rangeFromLsp(edit.replace) }
			: fallbackRange;
		return {
			label: item.label,
			kind: KINDS[item.kind ?? 1] ?? CompletionItemKind.Text,
			detail: item.detail ?? item.labelDetails?.description,
			documentation: item.documentation ? markdown(item.documentation) : undefined,
			insertText: edit?.newText ?? item.insertText ?? item.label,
			insertTextRules: item.insertTextFormat === 2 ? CompletionItemInsertTextRule.InsertAsSnippet : undefined,
			sortText: item.sortText,
			filterText: item.filterText,
			preselect: item.preselect,
			tags: item.tags?.includes(1) ? [CompletionItemTag.Deprecated] : undefined,
			range,
			lsp: item,
		};
	};

	const documentFor = (model: editor.ITextModel) => attached.get(model.uri.toString());

	const completionProvider: languages.CompletionItemProvider = {
		triggerCharacters: [".", "[", "\"", "'"],

		async provideCompletionItems(model, position, context) {
			const doc = documentFor(model);
			if (!doc) return { suggestions: [] };

			const client = await getPyrightClient();
			const result = await client.completion(doc.uri, toLsp(position), context.triggerCharacter);
			const items = Array.isArray(result) ? result : result?.items ?? [];

			const word = model.getWordUntilPosition(position);
			const fallback = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };

			return {
				suggestions: items.map(item => toCompletion(item, fallback)),
				incomplete: !Array.isArray(result) && !!result?.isIncomplete,
			};
		},

		async resolveCompletionItem(item) {
			const { lsp } = item as PyrightCompletion;
			if (!lsp || lsp.documentation) return item;
			const client = await getPyrightClient();
			const resolved = await client.resolveCompletion(lsp);
			return {
				...item,
				detail: resolved.detail ?? item.detail,
				documentation: resolved.documentation ? markdown(resolved.documentation) : item.documentation,
			};
		},
	};

	const hoverProvider: languages.HoverProvider = {
		async provideHover(model, position) {
			const doc = documentFor(model);
			if (!doc) return null;

			const client = await getPyrightClient();
			const hover = await client.hover(doc.uri, toLsp(position));
			if (!hover) return null;

			return { contents: hoverContents(hover), range: hover.range ? rangeFromLsp(hover.range) : undefined };
		},
	};

	const signatureHelpProvider: languages.SignatureHelpProvider = {
		signatureHelpTriggerCharacters: ["(", ","],
		signatureHelpRetriggerCharacters: [")"],

		async provideSignatureHelp(model, position) {
			const doc = documentFor(model);
			if (!doc) return null;

			const client = await getPyrightClient();
			const help = await client.signatureHelp(doc.uri, toLsp(position));
			if (!help || help.signatures.length === 0) return null;

			return {
				value: {
					signatures: help.signatures.map(signature => ({
						label: signature.label,
						documentation: signature.documentation ? markdown(signature.documentation) : undefined,
						parameters: (signature.parameters ?? []).map(parameter => ({
							label: parameter.label,
							documentation: parameter.documentation ? markdown(parameter.documentation) : undefined,
						})),
						activeParameter: signature.activeParameter ?? undefined,
					})),
					activeSignature: help.activeSignature ?? 0,
					activeParameter: help.activeParameter ?? 0,
				},
				dispose: () => {},
			};
		},
	};

	monaco.languages.registerCompletionItemProvider("python", completionProvider);
	monaco.languages.registerHoverProvider("python", hoverProvider);
	monaco.languages.registerSignatureHelpProvider("python", signatureHelpProvider);
}

const MARKER_OWNER = "pyright";

/**
 * Opens `model` on the server and keeps it in sync until the returned
 * function is called. Diagnostics land on the model as markers.
 */
export function attachPyright(monaco: Monaco, model: editor.ITextModel): () => void {

	const doc: Attached = {
		uri: `${ROOT_URI}/script_${++nextDocument}.py`,
		version: 1,
		lineCount: model.getLineCount(),
	};
	const key = model.uri.toString();
	attached.set(key, doc);

	const severity = (diagnostic: Diagnostic) => {
		switch (diagnostic.severity) {
			case 1: return monaco.MarkerSeverity.Error;
			case 2: return monaco.MarkerSeverity.Warning;
			case 3: return monaco.MarkerSeverity.Info;
			default: return monaco.MarkerSeverity.Hint;
		}
	};

	let client: PyrightClient | null = null;
	let closed = false;

	const text = () => wrapScript(model.getLinesContent().join("\n"));

	void getPyrightClient().then(ready => {
		if (closed) return;
		client = ready;

		ready.onDiagnostics(doc.uri, ({ diagnostics }) => {
			if (model.isDisposed()) return;
			const userEnd = HEADER.length + doc.lineCount;
			monaco.editor.setModelMarkers(model, MARKER_OWNER, diagnostics
				// Only what's in the user's lines — not the wrapper's header or trailing `pass`.
				.filter(diagnostic => diagnostic.range.start.line >= HEADER.length && diagnostic.range.start.line < userEnd)
				.map(diagnostic => ({
					...rangeFromLsp(diagnostic.range),
					severity: severity(diagnostic),
					message: diagnostic.message,
					source: "basedpyright",
					code: typeof diagnostic.code === "object" ? String(diagnostic.code) : diagnostic.code?.toString(),
					tags: diagnostic.tags?.filter(tag => tag === 1 || tag === 2),
				})));
		});

		ready.open(doc.uri, text());
	}).catch(error => console.warn("[code-editor] Pyright failed to start", error));

	const subscription = model.onDidChangeContent(() => {
		doc.lineCount = model.getLineCount();
		if (client) client.change(doc.uri, ++doc.version, text());
	});

	return () => {
		closed = true;
		subscription.dispose();
		attached.delete(key);
		client?.close(doc.uri);
		if (!model.isDisposed()) monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
	};
}
