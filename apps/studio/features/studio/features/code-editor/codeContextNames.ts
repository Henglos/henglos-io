import { contextSourcesOf } from "@henglosio/workflow";
import type { IActionRuntime, IWorkflowRuntime } from "@henglosio/workflow";

export type CodeContextName = {
	/** What goes inside ctx.get("…"). */
	name: string;
	/** Shown next to the suggestion: where the value comes from. */
	detail: string;
	kind: "config" | "output";
};

const allActions = (workflow: IWorkflowRuntime): IActionRuntime[] => [
	workflow.start,
	...workflow.components.flatMap(component => component.actions),
];

/**
 * The actions whose outputs reach `actionId`: the ones right before it, and
 * further back through each that passes its context on (Pass Context).
 */
export const upstreamOf = (workflow: IWorkflowRuntime, actionId: string): Set<string> =>
	contextSourcesOf(workflow, actionId);

/**
 * The names a CODE script can pass to ctx.get() for one config — mirrors what
 * the device's pipeline actually holds when the script runs (ScriptEngine.py:
 * CODE configs run last, after the action's other configs and binds):
 *
 *  - the action's other configs, as "<action>/<config>" lowercased — the same
 *    name GenerateExecuteCommand hashes into the wire CONFIG_ID (configs with
 *    an explicit numeric id have no name to offer, so they're skipped);
 *  - outputs published by the actions whose data reaches it (upstreamOf) —
 *    their outputSchema names, which firmware publishes without a prefix.
 */
export const codeContextNames = (workflow: IWorkflowRuntime, actionId: string, configurationId: string): CodeContextName[] => {
	const actions = allActions(workflow);
	const self = actions.find(action => action.id === actionId);
	if (!self) return [];

	const actionName = self.base.displayName.toLowerCase();
	const configs: CodeContextName[] = self.configurations
		.filter(config => config.id !== configurationId && config.base.id === undefined)
		.map(config => ({
			name: `${actionName}/${config.base.displayName}`.toLowerCase(),
			detail: `config · ${config.base.type}`,
			kind: "config",
		}));

	const upstream = upstreamOf(workflow, actionId);
	const outputs = new Map<string, CodeContextName>();
	for (const action of actions) {
		if (!upstream.has(action.id)) continue;
		for (const output of action.base.outputSchema ?? []) {
			const name = output.name.toLowerCase();
			if (!outputs.has(name)) {
				outputs.set(name, { name, detail: `${action.alias} · ${output.type}`, kind: "output" });
			}
		}
	}

	return [...configs, ...outputs.values()];
};
