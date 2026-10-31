import type { Monaco } from "@monaco-editor/react";

// Mirrors packages/ui/src/globals.css's dark palette (the light
// [data-theme] isn't mirrored here) so the editor reads as part of the
// studio instead of a generic vs-dark drop-in. Registered once per <Editor>
// mount via beforeMount; Monaco keeps defined themes for the page's lifetime,
// re-defining on every mount is a harmless no-op (last write wins).
export const HENGLOS_MONACO_THEME = "henglos-dark";

export function defineHenglosMonacoTheme(monaco: Monaco) {

	monaco.editor.defineTheme(HENGLOS_MONACO_THEME, {
		base: "vs-dark",
		inherit: true,
		rules: [
			{ token: "", foreground: "d9dadc" },
			{ token: "comment", foreground: "8a8a8c", fontStyle: "italic" },
			{ token: "keyword", foreground: "43be61" },
			{ token: "string", foreground: "d59500" },
			{ token: "number", foreground: "55a6f4" },
			{ token: "operator", foreground: "acacae" },
			{ token: "delimiter", foreground: "acacae" },
			{ token: "identifier", foreground: "d9dadc" },
			{ token: "type", foreground: "55a6f4" },
		],
		colors: {
			// --chrome — the editor blends straight into the chrome it sits in
			// (CodeEditor.feature.tsx's own header already sits on that same
			// color), instead of standing out as a lighter "card". Floating bits
			// (suggestions, hover) use --overlay instead — same "pop above the
			// page" treatment Dropdown/Select already use elsewhere in the app.
			"editor.background": "#0c0c0e",
			"editor.foreground": "#d9dadc",
			"editorLineNumber.foreground": "#555557",
			"editorLineNumber.activeForeground": "#acacae",
			"editorCursor.foreground": "#35d363",
			"editor.lineHighlightBackground": "#ffffff0a",
			"editor.lineHighlightBorder": "#00000000",
			"editor.selectionBackground": "#35d36333",
			"editor.inactiveSelectionBackground": "#35d36321",
			"editorIndentGuide.background1": "#ffffff0f",
			"editorIndentGuide.activeBackground1": "#ffffff29",
			"editorWhitespace.foreground": "#ffffff0f",
			"editorGutter.background": "#0c0c0e",
			"editorWidget.background": "#1d1d1f",
			"editorWidget.border": "#ffffff1a",
			"editorSuggestWidget.background": "#1d1d1f",
			"editorSuggestWidget.border": "#ffffff1a",
			"editorSuggestWidget.selectedBackground": "#35d36321",
			"editorHoverWidget.background": "#1d1d1f",
			"editorHoverWidget.border": "#ffffff1a",
			"editorBracketMatch.background": "#35d36321",
			"editorBracketMatch.border": "#35d3634d",
			"editorError.foreground": "#ff7777",
			"editorWarning.foreground": "#d59500",
			"editorInfo.foreground": "#55a6f4",
			"scrollbarSlider.background": "#ffffff17",
			"scrollbarSlider.hoverBackground": "#ffffff29",
			"scrollbarSlider.activeBackground": "#ffffff29",
		},
	});

}
