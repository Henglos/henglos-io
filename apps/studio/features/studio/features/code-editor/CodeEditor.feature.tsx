import { useAtom, useAtomValue } from "jotai";
import Editor from "@monaco-editor/react";
import { Button, Text } from "@henglosio/ui";
import { Code2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Monaco, OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { CodeEditorTargetAtom } from "@/features/studio/store/canvas.store";
import { BoardLimitsAtom } from "@/features/studio/store/platform.store";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { defineHenglosMonacoTheme, HENGLOS_MONACO_THEME } from "./henglosMonacoTheme";
import { registerCtxNameCompletion, setCodeContextNames, setCodeVariableNames, utf8Length, validateMicropythonScript } from "./micropythonIntellisense";
import { codeContextNames, upstreamOf } from "./codeContextNames";
import { attachPyright, registerPyrightProviders } from "./pyright/monacoPyright";
import { dragExpression, useBindDroppable } from "@/features/studio/lib/bindDrag";
import clsx from "clsx";

const LANGUAGE_LABEL: Record<string, string> = { python: "MicroPython" };

const COMMIT_DELAY_MS = 400;

export const CodeEditor = () => {

	const [target, setTarget] = useAtom(CodeEditorTargetAtom);
	const workflow = useAtomValue(WorkflowAtom);
	const [draft, setDraft] = useState(target?.value ?? "");
	const monacoRef = useRef<Monaco | null>(null);
	const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

	const isPython = target?.language === "python";

	// What the board accepts for this text — a CODE binding's script, or a
	// "code" config's value — read live, so it follows Platform settings while open.
	const { protocol } = useAtomValue(BoardLimitsAtom);
	const maxBytes = target?.kind === "binding" ? protocol.maxCode : protocol.maxData;

	// The names ctx.get() can read at this point of the workflow — recomputed
	// as the graph changes, so a new upstream output shows up without reopening.
	const names = useMemo(
		() => (isPython && workflow && target ? codeContextNames(workflow.data, target.actionId, target.configurationId) : []),
		[isPython, workflow, target?.actionId, target?.configurationId],
	);

	const validate = () => {
		const model = editorRef.current?.getModel();
		if (!isPython || !monacoRef.current || !model || !target) return;
		validateMicropythonScript(monacoRef.current, model, {
			requireReturn: target.kind === "binding",
			maxBytes,
		});
	};

	const bytes = utf8Length(draft);

	const variableNames = useMemo(() => (workflow?.data.variables ?? []).map(variable => variable.name), [workflow?.data.variables]);

	useEffect(() => {
		setCodeContextNames(names);
		setCodeVariableNames(variableNames);
		validate();
	}, [names, variableNames, maxBytes]);

	// Only resyncs the draft when the target field actually changes (another
	// config, or reopened) — not on every re-render, or typing would erase
	// itself as soon as target.value (not committed yet) changed.
	useEffect(() => {
		setDraft(target?.value ?? "");
	}, [target?.actionId, target?.configurationId]);

	// Committing to the workflow on every key re-renders the whole canvas and
	// sends one collab op per character — the draft stays local and only goes
	// to the workflow after a pause in typing. Keeps the onChange with the
	// value so the flush on switching fields goes to the old field, not the new one.
	const pendingRef = useRef<{ value: string; onChange: (value: string) => void } | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const flush = () => {
		clearTimeout(timerRef.current);
		const pending = pendingRef.current;
		pendingRef.current = null;
		pending?.onChange(pending.value);
	};

	// The cleanup runs before switching fields, on close (target → null) and on unmount.
	useEffect(() => flush, [target?.actionId, target?.configurationId]);

	// The editor's model stays open on the language server while it's mounted.
	const detachPyrightRef = useRef<(() => void) | null>(null);
	useEffect(() => () => detachPyrightRef.current?.(), []);

	// The actions whose data reaches the action being edited (Pass Context) —
	// only their outputs are there for its script to read.
	const sources = useMemo(
		() => (workflow && target ? upstreamOf(workflow.data, target.actionId) : null),
		[workflow, target?.actionId],
	);

	// An output, a field of one, or a variable dropped in the editor writes what
	// reads it — ctx.get("networks")[0]["ssid"] — where it lands.
	const [instance, setInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
	const { setNodeRef: setDropRef, state: dropState } = useBindDroppable("code-editor", {
		accepts: drag => !isPython ? null
			: drag.kind === "variable" || !sources || sources.has(drag.actionId) ? "ok"
			: "deny",
		onDrop: (drag, point) => {
			if (!instance) return;
			const position = (point && instance.getTargetAtClientPoint(point.x, point.y)?.position) ?? instance.getPosition();
			if (!position) return;
			const text = dragExpression(drag);
			const { lineNumber, column } = position;
			instance.executeEdits("bind-drop", [{
				range: { startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column },
				text,
				forceMoveMarkers: true,
			}]);
			instance.setPosition({ lineNumber: position.lineNumber, column: position.column + text.length });
			instance.focus();
		},
	});

	const close = () => setTarget(null);

	useEffect(() => {
		if (!target) return;

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
		};

		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [target]);

	if (!target) return null;

	const commit = (value: string | undefined) => {
		const next = value ?? "";
		setDraft(next);
		pendingRef.current = { value: next, onChange: target.onChange };
		clearTimeout(timerRef.current);
		timerRef.current = setTimeout(flush, COMMIT_DELAY_MS);
		validate();
	};

	const beforeMount = (monaco: Monaco) => {
		defineHenglosMonacoTheme(monaco);
		registerCtxNameCompletion(monaco);
		registerPyrightProviders(monaco);
	};

	const onMount: OnMount = (instance, monaco) => {
		editorRef.current = instance;
		setInstance(instance);
		monacoRef.current = monaco;
		const model = instance.getModel();
		if (isPython && model) {
			detachPyrightRef.current?.();
			detachPyrightRef.current = attachPyright(monaco, model);
		}
		validate();
	};

	return (

		<div className="flex flex-col h-full">

			<div className="p-4 h-10 flex items-center justify-between shrink-0 border-b border-line">
				<div className="flex items-center gap-2">
					<Code2 size={13} className="text-fg-secondary" />
					<Text variant="dim" size="xs" font="mono">{target.displayName}</Text>
					{LANGUAGE_LABEL[target.language] && (
						<Text variant="low" size="xs">· {LANGUAGE_LABEL[target.language]}</Text>
					)}
				</div>
				<Button.Root variant="ghost" className="p-2!" onClick={close}>
					<Button.Icon>
						<X size={12} />
					</Button.Icon>
				</Button.Root>
			</div>

			{isPython && (
				<div className="flex items-start justify-between gap-4 px-4 py-2 shrink-0 border-b border-line-subtle">
					<Text variant="low" size="xs">
						{target.kind === "binding"
							? <>Return the config&apos;s value. <span className="font-mono">ctx.get(&quot;name&quot;)</span> reads this action&apos;s configs and upstream outputs.</>
							: <>Runs on the board. <span className="font-mono">ctx.get(&quot;name&quot;)</span> reads upstream outputs; <span className="font-mono">return</span> publishes <span className="font-mono">result</span>.</>
						}
					</Text>
					<Text size="xs" font="mono" className={bytes > maxBytes ? "text-danger shrink-0" : "text-fg-muted shrink-0"}>
						{bytes}/{maxBytes} B
					</Text>
				</div>
			)}

			<div ref={setDropRef} className={clsx("flex-1 min-h-0", dropState === "ok" && "ring-1 ring-inset ring-accent")}>
				<Editor
					language={target.language}
					value={draft}
					onChange={commit}
					theme={HENGLOS_MONACO_THEME}
					beforeMount={beforeMount}
					onMount={onMount}
					options={{
						minimap: { enabled: false },
						fontSize: 13,
						scrollBeyondLastLine: false,
						automaticLayout: true,
						// Off by default in Monaco — in this narrow sidebar panel that
						// meant any line past the visible width just kept going
						// off-screen instead of wrapping, which read as "a character
						// limit per line" (worse combined with paste being broken —
						// see Workspace.layout.tsx's isEditingText — since there was no
						// way to even scroll a pasted long line into view to notice it
						// wasn't actually cut off).
						wordWrap: "on",
					}}
				/>
			</div>

		</div>

	);

};
