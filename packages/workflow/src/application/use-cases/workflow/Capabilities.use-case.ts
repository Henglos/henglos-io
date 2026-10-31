import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";
import type { ICapability } from "../../../domain/value-objects/Capabilities.js";
import { findNodeSchema } from "./AddActionToComponent.use-case.js";
import { withoutDisabledActions } from "./WithoutDisabledActions.js";

// Whether the board runs what a workflow asks of it: each node needs its
// component's capabilities (dependences.capabilities) and its own (an action's
// or trigger's `capabilities`, on top). A board that doesn't list any
// (a manifest from before capabilities) isn't checked: unknown, not "none".

type BoardCapabilities = { capabilities?: readonly ICapability[] } | undefined;

/** What a node needs to run: its component's capabilities and its own. */
export function nodeCapabilities(component: Pick<IComponentRuntime, "base">, action: Pick<IActionRuntime, "base">): ICapability[] {
	const own = findNodeSchema(component as IComponentRuntime, action.base.displayName)?.capabilities ?? action.base.capabilities ?? [];
	return [...new Set([...(component.base.capabilities ?? []), ...own])];
}

/** What of `needs` the board doesn't have — none when it doesn't say what it has. */
export function missingCapabilities(board: BoardCapabilities, needs: readonly ICapability[]): ICapability[] {
	const has = board?.capabilities;
	if (!has) return [];
	return needs.filter(capability => !has.includes(capability));
}

/** A node its board can't run, and what the board lacks for it. */
export type UnsupportedNode = {
	componentId: string;
	actionId: string;
	/** "HTTP › Request" */
	label: string;
	missing: ICapability[];
};

/** The nodes that run (disabled ones out) its board can't — what each lacks. */
export function unsupportedNodes(workflow: IWorkflowRuntime): UnsupportedNode[] {
	const running = withoutDisabledActions(workflow);
	const board = running.board.base;
	return running.components.flatMap(component => component.actions.flatMap(action => {
		const missing = missingCapabilities(board, nodeCapabilities(component, action));
		return missing.length ? [{ componentId: component.id, actionId: action.id, label: `${component.alias} › ${action.alias}`, missing }] : [];
	}));
}

/** One line for a person: `HTTP › Request needs wifi; WiFi › Connect needs wifi — ESP32-H2 has none of those`. */
export function describeUnsupported(workflow: IWorkflowRuntime, nodes: UnsupportedNode[]): string {
	const list = nodes.map(node => `${node.label} needs ${node.missing.join(", ")}`).join("; ");
	return `${list} — the board (${workflow.board.base.name}) doesn't have ${nodes.length === 1 && nodes[0]!.missing.length === 1 ? "it" : "those"}`;
}
