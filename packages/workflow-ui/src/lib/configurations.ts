import type { IActionRuntime, IComponentRuntime, IConfigurationRuntime, IConfigurationSchema } from "@henglosio/workflow";
import { START_NODE_ID } from "../types";

// id is optional on IConfigurationSchema (omitted ids get their wire id
// computed from displayName instead), so it can't be relied on alone to match
// a schema entry against its stored runtime value: several configs of one
// action can all have id === undefined. displayName is the fallback key —
// unique enough within one action's own config list.
const matchKey = (schema: IConfigurationSchema) => schema.id ?? schema.displayName;

/** Every config the action's schema declares, with its stored value — or its default when it has none yet. */
export const mergeConfigurations = (base: IConfigurationSchema[] | undefined, runtime: IConfigurationRuntime[]) =>
	(base ?? []).map(schema => {
		const existing = runtime.find(c => matchKey(c.base) === matchKey(schema));
		return existing ?? { id: `pending:${matchKey(schema)}`, base: schema, binding: null, value: schema.defaultValue } satisfies IConfigurationRuntime;
	});

// displayOptions.show/hide are keyed by a sibling config's displayName (the
// identifier component authors use in manifest.yaml).
const siblingValue = (all: IConfigurationRuntime[], key: string): unknown =>
	all.find(c => c.base.displayName === key)?.value;

/** Whether `configuration` shows, given its siblings' values (its displayOptions). */
export const isConfigVisible = (configuration: IConfigurationRuntime, all: IConfigurationRuntime[]): boolean => {

	const { show, hide } = configuration.base.displayOptions ?? {};

	if (show) {
		for (const [key, allowed] of Object.entries(show)) {
			if (!allowed.includes(siblingValue(all, key) as string | number)) return false;
		}
	}

	if (hide) {
		for (const [key, disallowed] of Object.entries(hide)) {
			if (disallowed.includes(siblingValue(all, key) as string | number)) return false;
		}
	}

	return true;

};

/** Start, shaped as the component its node and fields expect. */
export const startAsComponent = (start: IActionRuntime): IComponentRuntime => ({
	id: START_NODE_ID,
	packageId: "core",
	alias: start.base.displayName,
	base: { displayName: start.base.displayName, description: start.base.description },
	actions: [start],
});
