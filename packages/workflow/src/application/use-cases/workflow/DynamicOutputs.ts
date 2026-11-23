import { v4 } from "uuid";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IActionSchema } from "../../../domain/entities/IAction.schema.js";

// An action's `dynamicOutputs` (see IAction.schema.ts): an output per row of
// one of its fixedCollections — a Switch's rule each — kept in step with the
// rows. Row n is "<idPrefix>_<n>" (its wire id generateId of that, like any
// output); an output still there keeps its runtime id, and so its wires; the
// ones past the last row go, wires and all.

type DynamicOutputs = NonNullable<IActionSchema["dynamicOutputs"]>;

const dynamicId = (spec: DynamicOutputs, n: number) => `${spec.idPrefix}_${n}`;
const isDynamic = (spec: DynamicOutputs, id: string) => new RegExp(`^${spec.idPrefix}_\\d+$`).test(id);

/** The rows of `spec`'s fixedCollection group, as `action` holds them now — undefined when it doesn't hold a list (bound to a script…). */
function rowsOf(action: IActionRuntime, spec: DynamicOutputs): Record<string, unknown>[] | undefined {
	const config = action.configurations.find(found => found.base.name === spec.property || found.base.displayName === spec.property);
	if (!config || config.binding) return undefined;
	const value = config.value ?? config.base.defaultValue;
	if (value === undefined) return [];
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const rows = (value as Record<string, unknown>)[spec.group];
	return Array.isArray(rows) ? rows as Record<string, unknown>[] : rows && typeof rows === "object" ? [rows as Record<string, unknown>] : [];
}

/** `action` with its dynamic outputs matching its rows — itself when it has none, or they already do. */
export function syncDynamicOutputs(action: IActionRuntime): IActionRuntime {
	const spec = action.base.dynamicOutputs;
	if (!spec) return action;
	const rows = rowsOf(action, spec);
	if (!rows) return action;

	const wanted = rows.map((row, i) => {
		const label = spec.labelField ? row[spec.labelField] : undefined;
		return { id: dynamicId(spec, i + 1), name: typeof label === "string" && label.trim() ? label.trim() : `${spec.namePrefix} ${i + 1}` };
	});
	const fixedBase = (action.base.outputs ?? []).filter(handle => !isDynamic(spec, handle.id));
	const fixedRuntime = action.outputs.filter(handle => !isDynamic(spec, handle.base.id));
	const runtime = wanted.map(base => {
		const held = action.outputs.find(handle => handle.base.id === base.id);
		return held ? { ...held, base } : { id: v4(), base };
	});

	const before = action.outputs.map(handle => `${handle.id}:${handle.base.id}:${handle.base.name}`).join("|");
	const after = [...runtime, ...fixedRuntime].map(handle => `${handle.id}:${handle.base.id}:${handle.base.name}`).join("|");
	if (before === after) return action;

	return {
		...action,
		base: { ...action.base, outputs: [...wanted, ...fixedBase] },
		outputs: [...runtime, ...fixedRuntime],
	};
}

/**
 * `workflow` with node `actionId`'s dynamic outputs synced — the wires
 * leaving an output that's gone, gone too. The same workflow when nothing
 * changes.
 */
export function withDynamicOutputs(workflow: IWorkflowRuntime, componentId: string, actionId: string): IWorkflowRuntime {
	const componentIdx = workflow.components.findIndex(c => c.id === componentId);
	if (componentIdx === -1) return workflow;
	const component = workflow.components[componentIdx]!;
	const action = component.actions.find(found => found.id === actionId);
	if (!action) return workflow;

	const synced = syncDynamicOutputs(action);
	if (synced === action) return workflow;

	const components = [...workflow.components];
	components[componentIdx] = { ...component, actions: component.actions.map(found => found.id === actionId ? synced : found) };
	const kept = new Set(synced.outputs.map(handle => handle.id));
	const gone = new Set(action.outputs.map(handle => handle.id).filter(id => !kept.has(id)));
	return {
		...workflow,
		components,
		connections: gone.size ? workflow.connections.filter(c => !(c.source === actionId && gone.has(c.sourceHandle))) : workflow.connections,
	};
}
