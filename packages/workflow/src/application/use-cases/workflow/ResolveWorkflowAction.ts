import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";
import { generateId } from "../../../utils/identifier.js";

/** A node found in the workflow, with what it takes to encode it on the wire. */
export interface ResolvedWorkflowAction {
	action: IActionRuntime;
	// Namespace half of the wire ACTION_ID formula — see computeWireActionId.
	componentName: string;
	configurations: IConfigurationRuntime[];
}

// Finds an action anywhere in the workflow (the virtual Start node, a board action,
// or a component action) along with the configurations that apply to it.
export function resolveWorkflowAction(workflow: IWorkflowRuntime, actionId: string): ResolvedWorkflowAction | undefined {

	if (workflow.start.id === actionId) {
		return {
			action: workflow.start,
			componentName: "core",
			configurations: workflow.start.configurations,
		};
	}

	const boardAction = workflow.board.actions.find(a => a.id === actionId);
	if (boardAction) {
		return {
			action: boardAction,
			componentName: workflow.board.base.name,
			configurations: [...workflow.board.configurations, ...boardAction.configurations],
		};
	}

	for (const component of workflow.components) {
		const action = component.actions.find(a => a.id === actionId);
		if (action) {
			return {
				action,
				componentName: component.base.displayName,
				configurations: action.configurations,
			};
		}
	}

	return undefined;
}

// The "<component>/<action>" string half of the wire ACTION_ID formula — also
// where the action is installed on the board (/components/<component>/<action>.mpy,
// see the board's build) and the name its module registers with
// @action("<component>/<action>"). Shared here so every call site computes it
// the same way.
export function computeComponentStorageName(componentName: string, actionDisplayName: string): string {
	return `${componentName}/${actionDisplayName}`.toLowerCase();
}

// Wire ACTION_ID = generateId(componentStorageName) — the firmware's registry
// finds the action class by this same hash (generate_id of the name its
// @action decorator was given).
export function computeWireActionId(componentName: string, action: IActionRuntime): number {
	return generateId(computeComponentStorageName(componentName, action.base.displayName));
}

// Wire INSTANCE_ID = generateId(action.id) — identifies one specific graph-node
// occurrence, unlike ACTION_ID above which only identifies the action's TYPE and
// is therefore shared by every instance of it (e.g. two "GPIO Write" nodes sitting
// on an If's True/False branches both have the same ACTION_ID). Standalone/Play
// replay has no host round-trip to arbitrate which of two same-type actions comes
// next, so it needs this to disambiguate — see PacketCodec.py's
// OutputLink.target_instance_id and ExecuteCommand's _expected_instance_id guard.
export function computeWireInstanceId(action: IActionRuntime): number {
	return generateId(action.id);
}
