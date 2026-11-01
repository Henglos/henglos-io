import type { IConfigurationRuntime, IOptionEntrySchema, IVariableRuntime } from "@henglosio/workflow";

// A config as one short line for the compact node — what it's set to, or
// what it's bound to — and whether a required one is still empty.

export type ConfigurationSummary = {
	name: string;
	text: string;
	/** Bound to an output, a variable or code — shown apart from a literal value. */
	bound: boolean;
	/** Required and neither set nor bound. */
	missing: boolean;
};

const MAX_TEXT = 28;

const clip = (text: string) => text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;

// An options config's label for its value — options may be grouped in categories.
const optionLabel = (entries: IOptionEntrySchema[], value: string): string | undefined => {
	for (const entry of entries) {
		if ("options" in entry) {
			const found = optionLabel(entry.options as IOptionEntrySchema[], value);
			if (found) return found;
		} else if (entry.value === value) {
			return entry.displayName;
		}
	}
	return undefined;
};

const isEmpty = (value: unknown) =>
	value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

export function summarizeConfiguration(configuration: IConfigurationRuntime, variables: IVariableRuntime[]): ConfigurationSummary {

	const { base, value, binding } = configuration;
	const name = base.displayName;

	if (binding) {
		const text = "code" in binding ? "code"
			: "variableId" in binding ? `var ${variables.find(variable => variable.id === binding.variableId)?.name ?? "?"}`
			: "outputName" in binding ? `← ${binding.outputName}`
			: `← ${binding.configurationName}`;
		return { name, text: clip(text), bound: true, missing: false };
	}

	const missing = !!base.required && isEmpty(value);
	if (isEmpty(value)) return { name, text: "—", bound: false, missing };

	const text = ((): string => {
		switch (base.type) {
			case "toggle": return value ? "on" : "off";
			case "password": return "••••";
			case "options": return optionLabel(base.options, value as string) ?? String(value);
			case "pin": return (value as { displayName?: string; gpio?: number }).displayName ?? `GPIO${(value as { gpio?: number }).gpio}`;
			case "file": return (value as { name: string }).name;
			case "credential": return "credential";
			case "code": return "script";
			case "array": return `${(value as unknown[]).length} items`;
			case "object": return `${Object.keys(value as object).length} fields`;
			case "any": return String((value as { value?: unknown }).value ?? value);
			default: return typeof value === "object" ? JSON.stringify(value) : String(value);
		}
	})();

	return { name, text: clip(text), bound: false, missing };

}
