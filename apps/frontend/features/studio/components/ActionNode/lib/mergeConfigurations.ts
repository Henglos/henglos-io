import type { IConfigurationRuntime, IConfigurationSchema } from "@henglosio/workflow";

// id is optional on IConfigurationSchema (see IConfiguration.schema.ts — omitted
// ids get their wire id computed from displayName instead), so it can't be relied
// on alone to match a schema entry against its stored runtime value: multiple
// configs in the same action can all have id === undefined. displayName is the
// fallback key in that case — unique enough within a single action's own config list.
const matchKey = (schema: IConfigurationSchema) => schema.id ?? schema.displayName;

export const mergeConfigurations = (base: IConfigurationSchema[] | undefined, runtime: IConfigurationRuntime[]) =>
	(base ?? []).map(schema => {
		const existing = runtime.find(c => matchKey(c.base) === matchKey(schema));
		return existing ?? { id: `pending:${matchKey(schema)}`, base: schema, binding: null, value: schema.defaultValue } satisfies IConfigurationRuntime;
	});
