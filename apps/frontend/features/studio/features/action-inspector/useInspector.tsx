import { useEffect, useMemo, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import { RemoveActionFromWorkflowComponent, actionPassesContext, isSwitchAction, isTriggerAction, switchCaseCount } from "@henglosio/workflow";
import type { IActionRuntime, IComponentRuntime, IConfigurationRuntime } from "@henglosio/workflow";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { WorkspaceSelectionAtom } from "@/features/studio/store/canvas.store";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";
import { useActionResult } from "@/features/studio/hooks/useActionResult";
import { useSyncedDraft } from "@/features/studio/lib/useSyncedDraft";
import { mergeConfigurations } from "@/features/studio/components/ActionNode/lib/mergeConfigurations";
import { isConfigVisible } from "@/features/studio/components/ActionNode/lib/isConfigVisible";
import { ConfigurationField } from "@/features/studio/components/ActionNode/components/ConfigurationField.component";
import { upstreamOf } from "@/features/studio/features/code-editor/codeContextNames";
import { PassContextField } from "./components/PassContextField.component";
import { SwitchCasesField } from "./components/SwitchCasesField.component";

const NOTES_COMMIT_DELAY_MS = 400;

/**
 * Everything an inspector shows of one action and does to it — shared by the
 * right sidebar's and the bottom panel's, which only lay it out differently:
 * its configs (basic, advanced) as fields, the actions before it (what it can
 * bind to), its outputs and last run, its notes, ▶ / disable / delete.
 */
export function useInspector(component: IComponentRuntime, action: IActionRuntime) {

	const [workflow, setWorkflow] = useAtom(WorkflowAtom);
	const setSelection = useSetAtom(WorkspaceSelectionAtom);
	const mutate = useWorkflowMutate();
	const { shown, runner, debugging } = useActionResult(action.id);

	const board = workflow?.data.board;
	const configurations = mergeConfigurations(action.base.configurations, action.configurations);
	// Visibility is evaluated over the whole list: a basic config may show/hide
	// on an advanced one (displayOptions reference siblings by displayName).
	const visible = configurations.filter(configuration => isConfigVisible(configuration, configurations));
	const basic = visible.filter(configuration => !configuration.base.advanced);
	const advanced = visible.filter(configuration => configuration.base.advanced);
	const outputSchema = action.base.outputSchema ?? [];
	// Values the action published that no output declares.
	const undeclared = shown?.values.filter(value => !outputSchema.some(output => output.name === value.name)) ?? [];
	const disabled = !!action.disabled;

	// The actions whose data reaches this one — what its configs can bind to.
	const upstream = useMemo(() => {
		if (!workflow) return [];
		const before = upstreamOf(workflow.data, action.id);
		return workflow.data.components.flatMap(found => found.actions
			.filter(candidate => before.has(candidate.id) && (candidate.base.outputSchema ?? []).length > 0)
			.map(candidate => ({ component: found, action: candidate })));
	}, [workflow, action.id]);

	const configure = (configurationId: string, op: Record<string, unknown>) =>
		mutate({ componentId: component.id, actionId: action.id, configurationId, ...op } as Parameters<typeof mutate>[0]);

	const renderFields = (list: IConfigurationRuntime[]) => board && list.map(configuration => (
		<ConfigurationField
			key={configuration.id}
			configuration={configuration}
			component={component}
			board={board}
			actionId={action.id}
			connections={workflow?.data.connections ?? []}
			onChange={value => configure(configuration.id, { op: "update:configuration", value })}
			onBindOutput={(sourceActionId, outputName) => configure(configuration.id, { op: "bind:configuration-output", sourceActionId, outputName })}
			onSetCode={code => configure(configuration.id, { op: "bind:configuration-code", code })}
			variables={workflow?.data.variables ?? []}
			onBindVariable={variableId => configure(configuration.id, { op: "bind:configuration-variable", variableId })}
		/>
	));

	// Notes: the draft stays local while typing and only reaches the workflow
	// after a pause (or on blur/unmount) — like the code editor.
	const [notes, setNotes] = useSyncedDraft(action.notes ?? "", v => v);
	const notesTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const pendingNotesRef = useRef<string | null>(null);

	const flushNotes = () => {
		clearTimeout(notesTimerRef.current);
		const pending = pendingNotesRef.current;
		pendingNotesRef.current = null;
		if (pending === null || pending === (action.notes ?? "")) return;
		mutate({ op: "update:action-notes", componentId: component.id, actionId: action.id, notes: pending });
	};

	const onNotesChange = (next: string) => {
		setNotes(next);
		pendingNotesRef.current = next;
		clearTimeout(notesTimerRef.current);
		notesTimerRef.current = setTimeout(flushNotes, NOTES_COMMIT_DELAY_MS);
	};

	const flushNotesRef = useRef(flushNotes);
	useEffect(() => { flushNotesRef.current = flushNotes; });
	useEffect(() => () => flushNotesRef.current(), []);

	// Advanced › Pass Context — on every action but Start and the triggers
	// (nothing comes before them to pass on).
	const canPassContext = !!workflow && workflow.data.start.id !== action.id && !isTriggerAction(action);
	const passContext = !!workflow && actionPassesContext(workflow.data, action.id);
	const renderPassContext = () => canPassContext && (
		<PassContextField
			checked={passContext}
			onChange={checked => mutate({ op: "update:action-pass-context", componentId: component.id, actionId: action.id, passContext: checked })}
		/>
	);
	// How many entries the Advanced fold holds.
	const advancedCount = advanced.length + (canPassContext ? 1 : 0);

	// Switch: its cases, added and removed at the end — under its settings.
	const renderSwitchCases = () => workflow && isSwitchAction(workflow.data, action.id) && (
		<SwitchCasesField
			count={switchCaseCount(action)}
			onAdd={() => mutate({ op: "add:switch-case", componentId: component.id, actionId: action.id })}
			onRemove={n => mutate({ op: "remove:switch-case", componentId: component.id, actionId: action.id, case: n })}
		/>
	);

	const onToggleDisabled = () =>
		mutate({ op: "update:action-disabled", componentId: component.id, actionId: action.id, disabled: !disabled });

	const onDelete = () => {
		if (!workflow) return;
		const { workflow: updated } = new RemoveActionFromWorkflowComponent().execute(workflow.data, component.id, action.id);
		setWorkflow({ ...workflow, data: updated });
		setSelection([]);
	};

	const close = () => setSelection([]);

	return {
		component, action, shown, runner, debugging, disabled,
		basic, advanced, advancedCount, renderFields, renderPassContext, renderSwitchCases, outputSchema, undeclared, upstream,
		notes, onNotesChange, flushNotes, onToggleDisabled, onDelete, close,
	};

}

export type Inspector = ReturnType<typeof useInspector>;
