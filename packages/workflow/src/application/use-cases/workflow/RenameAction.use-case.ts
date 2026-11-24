import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";

/** A node's name is at most this long. */
export const MAX_ACTION_ALIAS_LENGTH = 64;

const key = (alias: string) => alias.trim().toLowerCase();

/**
 * `alias`, or — when another node of the workflow (Start included) already
 * has it — the same with the first free number beside it: "If" → "If 2",
 * "If 2" → "If 3". Compared ignoring case; kept within MAX_ACTION_ALIAS_LENGTH.
 */
export const uniqueActionAlias = (workflow: IWorkflowRuntime, alias: string, actionId: string): string => {
	const taken = new Set(
		[workflow.start, ...workflow.components.flatMap(component => component.actions)]
			.filter(action => action.id !== actionId)
			.map(action => key(action.alias)),
	);
	if (!taken.has(key(alias))) return alias;
	const stem = alias.replace(/\s+\d+$/, "");
	for (let n = 2; ; n++) {
		const suffix = ` ${n}`;
		const candidate = `${stem.slice(0, MAX_ACTION_ALIAS_LENGTH - suffix.length).trimEnd()}${suffix}`;
		if (!taken.has(key(candidate))) return candidate;
	}
};

// What it's named: trimmed, cut at MAX_ACTION_ALIAS_LENGTH — its action's own
// name (base.displayName) when left empty — and numbered when another node has
// it already. Only what the studio shows: the wire ids come from the node's id
// and its action's displayName.
const named = (workflow: IWorkflowRuntime, action: IActionRuntime, alias: string): IActionRuntime => {
	const name = alias.trim().slice(0, MAX_ACTION_ALIAS_LENGTH) || action.base.displayName;
	return { ...action, alias: uniqueActionAlias(workflow, name, action.id) };
};

/** Renames a node — Start included. */
export class RenameWorkflowAction {
	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string, alias: string): IWorkflowRuntime {
		if (workflow.start.id === actionId) {
			return { ...workflow, start: named(workflow, workflow.start, alias) };
		}

		const componentIdx = workflow.components.findIndex(c => c.id === componentId);
		if (componentIdx === -1) return workflow;

		const component = workflow.components[componentIdx]!;
		if (!component.actions.some(action => action.id === actionId)) return workflow;

		const components = [...workflow.components];
		components[componentIdx] = {
			...component,
			actions: component.actions.map(action => action.id === actionId ? named(workflow, action, alias) : action),
		};
		return { ...workflow, components };
	}
}
