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

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

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
			case "list": return `${(value as unknown[]).length} items`;
			case "object": return `${Object.keys(value as object).length} fields`;
			case "any": {
				const any = value as { kind?: string; value?: unknown };
				if (any.kind === "list" && Array.isArray(any.value)) return `${any.value.length} items`;
				if (any.kind === "object" && any.value && typeof any.value === "object") return `${Object.keys(any.value).length} fields`;
				if (any.kind === "string") return `"${String(any.value)}"`;
				return String(any.value ?? value);
			}
			// n8n's types.
			case "dateTime": return String(value).replace("T", " ");
			case "json": return "JSON";
			case "multiOptions": {
				const picked = value as string[];
				return picked.length === 1 ? optionLabel(base.options, picked[0]!) ?? picked[0]! : `${picked.length} selected`;
			}
			case "collection": return plural(Object.keys(value as object).length, "option");
			case "fixedCollection": {
				const rows = Object.values(value as Record<string, unknown>).reduce<number>((count, held) => count + (Array.isArray(held) ? held.length : 1), 0);
				return plural(rows, "entry", "entries");
			}
			case "filter": {
				const { conditions = [], combinator } = value as { conditions?: unknown[]; combinator?: string };
				return conditions.length > 1 ? `${conditions.length} conditions · ${combinator === "or" ? "OR" : "AND"}` : plural(conditions.length, "condition");
			}
			case "assignmentCollection": return plural((value as { assignments?: unknown[] }).assignments?.length ?? 0, "field");
			default: return typeof value === "object" ? JSON.stringify(value) : String(value);
		}
	})();

	return { name, text: clip(text), bound: false, missing };

}
