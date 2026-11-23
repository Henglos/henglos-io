import type { IConfigurationRuntime } from "../../domain/entities/IConfiguration.runtime.js";

// displayOptions.show/hide are keyed by a sibling config's displayName (the
// same identifier computeWireConfigId keys off of when no explicit id is set
// — see IConfiguration.schema.ts) or, written n8n's way, by its `name`.
const siblingValue = (all: IConfigurationRuntime[], key: string): unknown =>
	all.find(c => c.base.name === key || c.base.displayName === key)?.value;

/**
 * Whether `configuration` applies, given its siblings' values — what the
 * studio shows, and what GenerateExecuteCommand sends: a hidden config
 * isn't sent at all (the action reads None), so it takes no room in the
 * board's MAX_CONFIGS_PER_COMMAND.
 */
export const isConfigurationVisible = (configuration: IConfigurationRuntime, all: IConfigurationRuntime[]): boolean => {

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
