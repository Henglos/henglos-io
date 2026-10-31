import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import { isLogicComponent } from "../../../domain/value-objects/LogicComponent.js";
import { isVariablesComponent } from "../../../domain/value-objects/VariablesComponent.js";
import { generateId } from "../../../utils/identifier.js";

// Pass context: what an action hands the next one. By default only what it
// published (its outputs); with Pass Context on, also everything it was handed
// itself — so an output reaches as far down the flow as a chain of actions
// passing it on. Logic's and Variables' actions pass it by default: they steer
// the flow or store a variable, the data around them is still the flow's.

/** CONFIG_ID of the flag GenerateExecuteCommand adds to an action that passes its context (ExecuteCommand.py's _PASS_CONTEXT_ID). */
export const PASS_CONTEXT_CONFIG_ID = generateId("context/pass");

const passesByDefault = (workflow: IWorkflowRuntime, actionId: string): boolean => {
	const component = workflow.components.find(found => found.actions.some(action => action.id === actionId));
	return !!component && (isLogicComponent(component) || isVariablesComponent(component));
};

/** Whether `actionId` hands on what it was handed, along with its own outputs. */
export function actionPassesContext(workflow: IWorkflowRuntime, actionId: string): boolean {
	if (actionId === workflow.start.id) return false;
	const action = workflow.components.flatMap(component => component.actions).find(found => found.id === actionId)
		?? workflow.board.actions.find(found => found.id === actionId);
	// A trigger starts the branch: nothing came before it to pass on.
	if (!action || action.kind === "trigger") return false;
	return action.passContext ?? passesByDefault(workflow, actionId);
}

/**
 * The actions whose outputs `actionId` gets: the ones wired right before it,
 * and — through each of them that passes its context on — the ones before
 * those, and so on. A disabled action doesn't run: the flow passes straight
 * through it (withoutDisabledActions), and so does the data.
 */
export function contextSourcesOf(workflow: IWorkflowRuntime, actionId: string): Set<string> {
	const disabled = new Set(workflow.components.flatMap(component => component.actions).filter(action => action.disabled).map(action => action.id));
	const sources = new Set<string>();
	const walked = new Set<string>([actionId]);
	const queue = [actionId];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const connection of workflow.connections) {
			if (connection.target !== current || walked.has(connection.source)) continue;
			const source = connection.source;
			walked.add(source);
			if (disabled.has(source)) {
				queue.push(source);
				continue;
			}
			sources.add(source);
			if (actionPassesContext(workflow, source)) queue.push(source);
		}
	}
	sources.delete(actionId);
	return sources;
}

/**
 * Whether an output called `outputName` reaches `actionId` — published by one
 * of its context sources. A bind goes by that name (the board looks it up by
 * name too), not by which action it was first dragged from: one removed and
 * added again, or another publishing the same name, keeps it working.
 */
export function outputReaches(workflow: IWorkflowRuntime, actionId: string, outputName: string): boolean {
	const name = outputName.toLowerCase();
	const sources = contextSourcesOf(workflow, actionId);
	const actions = [workflow.start, ...workflow.board.actions, ...workflow.components.flatMap(component => component.actions)];
	return actions.some(action => sources.has(action.id) && (action.base.outputSchema ?? []).some(output => output.name.toLowerCase() === name));
}

// Absent when it's the action's default — same as notes and disabled.
const withPassContext = (action: IActionRuntime, passContext: boolean | undefined): IActionRuntime => {
	const { passContext: _previous, ...rest } = action;
	return passContext === undefined ? rest : { ...rest, passContext };
};

/** Turns an action's Pass Context on or off. Start has nothing to pass on. */
export class SetWorkflowActionPassContext {
	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string, passContext: boolean): IWorkflowRuntime {
		if (workflow.start.id === actionId) return workflow;

		const componentIdx = workflow.components.findIndex(c => c.id === componentId);
		if (componentIdx === -1) return workflow;

		const value = passContext === passesByDefault(workflow, actionId) ? undefined : passContext;
		const component = workflow.components[componentIdx]!;
		const components = [...workflow.components];
		components[componentIdx] = {
			...component,
			actions: component.actions.map(action => action.id === actionId ? withPassContext(action, value) : action),
		};
		return { ...workflow, components };
	}
}
