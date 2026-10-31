import type { IActionRuntime } from "../entities/IAction.runtime.js";
import type { IComponentRuntime } from "../entities/IComponent.runtime.js";
import type { IConnectionRuntime } from "../entities/IConnection.runtime.js";

// Trigger nodes saved before they had a `kind` — the schema flagged them
// (`trigger: true`, before components listed `triggers:` apart), or a
// process dropped the field — come back as triggers: told by their
// component's `triggers`, no input, nothing wired into them. Run wherever a
// workflow is read (the zod parse, the collab doc), so every old workflow fixes itself.

type Shape = {
	start: { id: string };
	components: IComponentRuntime[];
	connections: IConnectionRuntime[];
};

const asTrigger = (component: IComponentRuntime, action: IActionRuntime): IActionRuntime => {
	const declared = component.base?.triggers?.some(schema => schema.displayName === action.base?.displayName);
	// The old flag, on its saved schema.
	const { trigger: flagged, ...base } = (action.base ?? {}) as IActionRuntime["base"] & { trigger?: boolean };
	const trigger = action.kind === "trigger" || declared || flagged === true;
	if (!trigger) return action;
	if (action.kind === "trigger" && action.inputs.length === 0 && flagged === undefined) return action;
	return { ...action, base, kind: "trigger", inputs: [] };
};

/** `workflow` with every trigger node as one: flagged, no input, no wire leading into it — the same object when nothing changed. */
export function withTriggerNodes<T extends Shape>(workflow: T): T {
	let changed = false;
	const triggers = new Set<string>();

	const components = workflow.components.map(component => {
		if (!Array.isArray(component.actions)) return component;
		let touched = false;
		const actions = component.actions.map(action => {
			const fixed = asTrigger(component, action);
			if (fixed.kind === "trigger") triggers.add(fixed.id);
			if (fixed !== action) touched = true;
			return fixed;
		});
		if (!touched) return component;
		changed = true;
		return { ...component, actions };
	});

	const connections = workflow.connections.filter(connection => !triggers.has(connection.target) && connection.target !== workflow.start.id);
	if (connections.length !== workflow.connections.length) changed = true;

	return changed ? { ...workflow, components, connections } : workflow;
}

/** The same, for a value not parsed yet (a zod preprocess) — left as it is when it isn't shaped like a workflow. */
export const withTriggerNodesRaw = (raw: unknown): unknown => {
	if (!raw || typeof raw !== "object") return raw;
	const value = raw as Partial<Shape>;
	if (!value.start || typeof value.start.id !== "string" || !Array.isArray(value.components) || !Array.isArray(value.connections)) return raw;
	const shaped = value.components.every(component => component && typeof component === "object"
		&& Array.isArray((component as IComponentRuntime).actions)
		&& (component as IComponentRuntime).actions.every(action => action && typeof action === "object" && Array.isArray(action.inputs)));
	if (!shaped || !value.connections.every(connection => connection && typeof connection === "object")) return raw;
	return withTriggerNodes(value as Shape);
};
