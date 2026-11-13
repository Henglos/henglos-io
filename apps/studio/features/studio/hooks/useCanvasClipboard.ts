import { useAtomValue, useSetAtom } from "jotai";
import { emitToast } from "@henglosio/ui";
import { isLogicComponent, LOGIC_PACKAGE_ID, withLogicComponent } from "@henglosio/workflow";
import type { IActionRuntime, IComponentRuntime, IConfigurationRuntime, IConnectionRuntime, IWorkflowRuntime } from "@henglosio/workflow";
import { WorkflowAtom } from "../store/workflow.store";
import {
	NodePositionOverrideAtom,
	WorkspaceSelectionAtom,
	type WorkspaceSelection,
} from "../store/canvas.store";
import { useWorkflowMutate } from "./useWorkflowMutate";

const DUPLICATE_OFFSET = 40;
const CLIPBOARD_MARKER = "henglosio/actions";

type ClipboardConfigValue = { displayName: string; value: IConfigurationRuntime["value"] };

type ClipboardActionItem = {
	// The action's id in the source workflow — only used to remap the internal
	// connections below to the new ids the paste/duplicate creates; it has no
	// use after that.
	originalActionId: string;
	componentId: string;
	packageId: string;
	componentAlias: string;
	actionName: string;
	values: ClipboardConfigValue[];
	x?: number;
	y?: number;
};

type ClipboardConnection = {
	sourceActionId: string;
	targetActionId: string;
	// The port's name (base.name), not the handle id — a Handler's id is
	// generated again for every clone; the name (e.g. "out", "fallback") is what
	// stays the same across instances of the same action.
	sourceHandleName: string;
	targetHandleName: string;
};

type ClipboardPayload = {
	type: typeof CLIPBOARD_MARKER;
	items: ClipboardActionItem[];
	connections: ClipboardConnection[];
};

const groupByComponent = (actions: IActionRuntime[]): WorkspaceSelection[] => {
	const byComponent = new Map<string, string[]>();
	for (const action of actions) {
		if (!byComponent.has(action.componentId)) byComponent.set(action.componentId, []);
		byComponent.get(action.componentId)!.push(action.id);
	}
	return Array.from(byComponent.entries()).map(([componentId, actionId]) => ({ componentId, actionId }));
};

const handleName = (handlers: { id: string; base: { name: string } }[], handleId: string): string =>
	handlers.find(h => h.id === handleId)?.base.name ?? "default";

const resolveHandleId = (handlers: { id: string; base: { name: string } }[], name: string): string =>
	handlers.find(h => h.base.name === name)?.id ?? "default";

// Only the connections whose source AND target are in the selection — a
// connection leaving the copied group makes no sense in the clone.
const internalConnections = (connections: IConnectionRuntime[], actionsById: Map<string, IActionRuntime>): ClipboardConnection[] =>
	connections
		.filter(c => actionsById.has(c.source) && actionsById.has(c.target))
		.map(c => ({
			sourceActionId: c.source,
			targetActionId: c.target,
			sourceHandleName: handleName(actionsById.get(c.source)!.outputs, c.sourceHandle),
			targetHandleName: handleName(actionsById.get(c.target)!.inputs, c.targetHandle),
		}));

const toClipboardItem = (action: IActionRuntime, component: IComponentRuntime): ClipboardActionItem => ({
	originalActionId: action.id,
	componentId: component.id,
	packageId: component.packageId,
	componentAlias: component.alias,
	actionName: action.base.displayName,
	values: action.configurations
		.filter(config => config.value !== undefined)
		.map(config => ({ displayName: config.base.displayName, value: config.value })),
	x: action.x,
	y: action.y,
});

export function useCanvasClipboard() {

	const workflow = useAtomValue(WorkflowAtom);
	const selection = useAtomValue(WorkspaceSelectionAtom);
	const setSelection = useSetAtom(WorkspaceSelectionAtom);
	const setPositionOverrides = useSetAtom(NodePositionOverrideAtom);
	const mutate = useWorkflowMutate();

	const getSelectedActions = (): IActionRuntime[] => {
		if (!workflow) return [];
		const startId = workflow.data.start.id;
		const selectedIds = new Set(selection.flatMap(s => s.actionId).filter(id => id !== startId));
		return workflow.data.components
			.flatMap(component => component.actions)
			.filter(action => selectedIds.has(action.id));
	};

	// Finds the component already there (by the same id, or by packageId when
	// the clone landed in a workflow other than the one it was copied from) —
	// when there's neither, tries to add the package. Takes and returns the
	// workflow's state explicitly (instead of reading the atom) because, in a
	// paste/duplicate of several actions at once, the atom only updates between
	// renders — threading "current" through is what lets the batch's second
	// action already see the component the first one installed.
	const resolveComponent = async (
		current: IWorkflowRuntime,
		item: ClipboardActionItem,
	): Promise<{ component: IComponentRuntime; current: IWorkflowRuntime } | undefined> => {

		const existingById = current.components.find(c => c.id === item.componentId);
		if (existingById) return { component: existingById, current };

		const existingByPackage = current.components.find(c => c.packageId === item.packageId);
		if (existingByPackage) return { component: existingByPackage, current };

		// Built in: nothing to install — "add:action" puts it in the workflow.
		if (item.packageId === LOGIC_PACKAGE_ID) {
			const withLogic = withLogicComponent(current);
			return { component: withLogic.components.find(isLogicComponent)!, current: withLogic };
		}

		const previousIds = new Set(current.components.map(c => c.id));

		try {
			const afterInstall = await mutate({ op: "add:component", packageId: item.packageId });
			if (!afterInstall) throw new Error("no response");
			const installed = afterInstall.data.components.find(c => !previousIds.has(c.id));
			if (!installed) throw new Error("component not installed");
			return { component: installed, current: afterInstall.data };
		} catch {
			emitToast("error", `Couldn't add the component "${item.componentAlias}".`);
			return undefined;
		}

	};

	// Creates the action in the resolved component and applies the copied
	// values with update:configuration (matched by displayName — a
	// configuration's id is always new in the clone). Copies no binding, only
	// the literal value. Same reason for threading "current" as above: when two
	// actions of a batch go to the same component, the second needs to know
	// about the action the first just created, so the "which one is new" diff
	// doesn't mix them up.
	const createAction = async (
		current: IWorkflowRuntime,
		componentId: string,
		item: Pick<ClipboardActionItem, "actionName" | "values" | "x" | "y">,
	): Promise<{ action: IActionRuntime; current: IWorkflowRuntime } | undefined> => {

		const component = current.components.find(c => c.id === componentId);
		if (!component) return undefined;

		const previousActionIds = new Set(component.actions.map(a => a.id));

		const afterAdd = await mutate({
			op: "add:action",
			componentId,
			actionName: item.actionName,
		});
		if (!afterAdd) return undefined;

		let workingData = afterAdd.data;
		const componentAfterAdd = workingData.components.find(c => c.id === componentId);
		const newAction = componentAfterAdd?.actions.find(a => !previousActionIds.has(a.id));
		if (!newAction) return undefined;

		const valueOps = item.values
			.map(({ displayName, value }) => {
				const target = newAction.configurations.find(c => c.base.displayName === displayName);
				if (!target) return null;
				return {
					op: "update:configuration" as const,
					componentId,
					actionId: newAction.id,
					configurationId: target.id,
					value,
				};
			})
			.filter((op): op is NonNullable<typeof op> => op !== null);

		let finalAction = newAction;

		if (valueOps.length > 0) {
			const afterUpdate = await mutate(...valueOps);
			if (afterUpdate) {
				workingData = afterUpdate.data;
				const componentAfterUpdate = workingData.components.find(c => c.id === componentId);
				finalAction = componentAfterUpdate?.actions.find(a => a.id === newAction.id) ?? newAction;
			}
		}

		setPositionOverrides(prev => ({
			...prev,
			[finalAction.id]: {
				x: (item.x ?? 0) + DUPLICATE_OFFSET,
				y: (item.y ?? 0) + DUPLICATE_OFFSET,
			},
		}));

		return { action: finalAction, current: workingData };

	};

	// Recreates, in a single request, the connections between the clones —
	// with the {original/copied action id -> clone id} map built while
	// creating them, resolving each handle by its port's name (the original
	// handle id can't be reused — every clone gets Handlers with new ids).
	// Connections leaving the group (or whose end couldn't be cloned, e.g. a
	// component that wasn't allowed) are dropped.
	const recreateConnections = async (connections: ClipboardConnection[], idMap: Map<string, string>, newActionsById: Map<string, IActionRuntime>) => {

		const ops = connections
			.filter(c => idMap.has(c.sourceActionId) && idMap.has(c.targetActionId))
			.map(c => {

				const sourceId = idMap.get(c.sourceActionId)!;
				const targetId = idMap.get(c.targetActionId)!;
				const sourceAction = newActionsById.get(sourceId);
				const targetAction = newActionsById.get(targetId);

				return {
					op: "add:connection" as const,
					connection: {
						id: crypto.randomUUID(),
						source: sourceId,
						target: targetId,
						sourceHandle: sourceAction ? resolveHandleId(sourceAction.outputs, c.sourceHandleName) : "default",
						targetHandle: targetAction ? resolveHandleId(targetAction.inputs, c.targetHandleName) : "default",
					},
				};

			});

		if (ops.length > 0) await mutate(...ops);

	};

	const copy = async () => {

		if (!workflow) return;

		const actions = getSelectedActions();
		if (actions.length === 0) return;

		const items = actions
			.map(action => {
				const component = workflow.data.components.find(c => c.id === action.componentId);
				return component ? toClipboardItem(action, component) : null;
			})
			.filter((item): item is ClipboardActionItem => item !== null);

		if (items.length === 0) return;

		const actionsById = new Map(actions.map(a => [a.id, a]));
		const connections = internalConnections(workflow.data.connections, actionsById);

		const payload: ClipboardPayload = { type: CLIPBOARD_MARKER, items, connections };

		try {
			await navigator.clipboard.writeText(JSON.stringify(payload));
		} catch {
			emitToast("error", "Couldn't copy to the clipboard.");
		}

	};

	const paste = async () => {

		if (!workflow) return;

		let raw: string;

		try {
			raw = await navigator.clipboard.readText();
		} catch {
			return;
		}

		let payload: ClipboardPayload;

		try {
			payload = JSON.parse(raw);
		} catch {
			return;
		}

		if (payload?.type !== CLIPBOARD_MARKER || !Array.isArray(payload.items)) return;

		const created: IActionRuntime[] = [];
		const idMap = new Map<string, string>();
		let current = workflow.data;

		for (const item of payload.items) {

			const resolved = await resolveComponent(current, item);
			if (!resolved) continue;
			current = resolved.current;

			const result = await createAction(current, resolved.component.id, item);
			if (!result) continue;
			current = result.current;

			created.push(result.action);
			idMap.set(item.originalActionId, result.action.id);

		}

		if (payload.connections.length > 0) {
			const newActionsById = new Map(created.map(a => [a.id, a]));
			await recreateConnections(payload.connections, idMap, newActionsById);
		}

		if (created.length > 0) setSelection(groupByComponent(created));

	};

	const duplicate = async () => {

		if (!workflow) return;

		const actions = getSelectedActions();
		if (actions.length === 0) return;

		const actionsById = new Map(actions.map(a => [a.id, a]));
		const connections = internalConnections(workflow.data.connections, actionsById);

		const created: IActionRuntime[] = [];
		const idMap = new Map<string, string>();
		let current = workflow.data;

		for (const action of actions) {

			const component = current.components.find(c => c.id === action.componentId);
			if (!component) continue;

			const result = await createAction(current, component.id, {
				actionName: action.base.displayName,
				values: action.configurations
					.filter(config => config.value !== undefined)
					.map(config => ({ displayName: config.base.displayName, value: config.value })),
				x: action.x,
				y: action.y,
			});
			if (!result) continue;
			current = result.current;

			created.push(result.action);
			idMap.set(action.id, result.action.id);

		}

		if (connections.length > 0) {
			const newActionsById = new Map(created.map(a => [a.id, a]));
			await recreateConnections(connections, idMap, newActionsById);
		}

		if (created.length > 0) setSelection(groupByComponent(created));

	};

	return { copy, paste, duplicate };

}
