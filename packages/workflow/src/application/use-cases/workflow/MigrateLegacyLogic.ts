import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";
import type { IFilterConditionSchema, IFilterValueSchema } from "../../../domain/entities/IConfiguration.schema.js";
import type { IVariableRuntime } from "../../../domain/entities/IVariable.runtime.js";
import { isLogicComponent, LogicComponentSchema } from "../../../domain/value-objects/LogicComponent.js";
import { syncDynamicOutputs } from "./DynamicOutputs.js";

// If and Switch nodes of an older shape, in today's: If's Conditions (a
// filter), Switch's Routing Rules (a fixedCollection of filters). The older
// shapes, both carried in action.base by nodes made with them:
//   - the first: If's "Value" / "Condition" / "Compare to" (and "… 2" with
//     Combine), Switch's "Value" / "Match" / "Case N";
//   - rows: "Condition N value / operation / compare to" + Combine, and
//     "Case N value / operation / compare to".
// A value bound to an output or a variable becomes "{{ name }}" (what a
// filter reads by name); one computed by a script has no place in a filter
// and is left empty. A Switch keeps its outputs (case_N, Default) — and so its
// wires. Deterministic (ids from the node's), so running it twice, or on two
// copies, gives the same workflow; a node in today's shape is left as it is.

// The first shape's conditions ("eq", "gt", "contains"…) as the operations that test the same.
const OPERATION: Record<string, string> = {
	eq: "string:equals",
	ne: "string:not_equals",
	gt: "number:gt",
	gte: "number:gte",
	lt: "number:lt",
	lte: "number:lte",
	contains: "string:contains",
	not_contains: "string:not_contains",
	starts_with: "string:starts_with",
	ends_with: "string:ends_with",
	is_true: "boolean:is_true",
	is_false: "boolean:is_false",
	is_empty: "string:is_empty",
	is_not_empty: "string:is_not_empty",
};

const ROW = /^(Case|Condition) (\d+) (value|operation|compare to)$/;
const FIRST_SHAPE = new Set(["Value", "Condition", "Compare to", "Combine", "Value 2", "Condition 2", "Compare to 2", "Match"]);

const schemaOf = (name: "If" | "Switch") => LogicComponentSchema.actions!.find(action => action.displayName === name)!;

/** A config's value as a filter's text: a bound output / variable as "{{ name }}". */
function operand(config: IConfigurationRuntime | undefined, variables: IVariableRuntime[]): string {
	if (!config) return "";
	const { binding, value } = config;
	if (binding && "outputName" in binding) return `{{ ${binding.outputName} }}`;
	if (binding && "variableId" in binding) {
		const variable = variables.find(found => found.id === binding.variableId);
		return variable ? `{{ ${variable.name} }}` : "";
	}
	if (binding) return "";   // a script: no place in a filter
	return value === undefined || value === null ? "" : typeof value === "string" ? value : String(value);
}

const filterOf = (combinator: "and" | "or", conditions: Omit<IFilterConditionSchema, "id">[], idBase: string): IFilterValueSchema => ({
	combinator,
	conditions: conditions.map((condition, i) => ({ id: `${idBase}-c${i + 1}`, ...condition })),
});

/** A node's old configs: by their name, and its rows ("Case 2 value" → rows[2].value). */
function oldConfigs(node: IActionRuntime) {
	const byName = new Map(node.configurations.map(config => [config.base.displayName, config]));
	const rows = new Map<number, { value?: IConfigurationRuntime; operation?: IConfigurationRuntime; compare?: IConfigurationRuntime }>();
	for (const config of node.configurations) {
		const match = ROW.exec(config.base.displayName);
		if (!match) continue;
		const n = Number(match[2]);
		const entry = rows.get(n) ?? {};
		if (match[3] === "value") entry.value = config;
		else if (match[3] === "operation") entry.operation = config;
		else entry.compare = config;
		rows.set(n, entry);
	}
	const caseCells = node.configurations
		.map(config => ({ config, n: /^Case (\d+)$/.exec(config.base.displayName)?.[1] }))
		.filter((entry): entry is { config: IConfigurationRuntime; n: string } => entry.n !== undefined)
		.sort((a, b) => Number(a.n) - Number(b.n));
	return { byName, rows: [...rows].sort(([a], [b]) => a - b).map(([, row]) => row), caseCells };
}

const operationOf = (row: { operation?: IConfigurationRuntime }) =>
	typeof row.operation?.value === "string" && row.operation.value ? row.operation.value : "string:equals";

function migrateIf(node: IActionRuntime, variables: IVariableRuntime[]): IActionRuntime {
	const { byName, rows } = oldConfigs(node);
	const combine = byName.get("Combine")?.value;
	let filter: IFilterValueSchema;

	if (rows.length > 0) {
		filter = filterOf(combine === "or" ? "or" : "and", rows.map(row => ({
			leftValue: operand(row.value, variables),
			operator: operationOf(row),
			rightValue: operand(row.compare, variables),
		})), node.id);
	} else {
		const conditions = [{
			leftValue: operand(byName.get("Value"), variables),
			operator: OPERATION[String(byName.get("Condition")?.value ?? "eq")] ?? "string:equals",
			rightValue: operand(byName.get("Compare to"), variables),
		}];
		if (combine === "and" || combine === "or") {
			conditions.push({
				leftValue: operand(byName.get("Value 2"), variables),
				operator: OPERATION[String(byName.get("Condition 2")?.value ?? "eq")] ?? "string:equals",
				rightValue: operand(byName.get("Compare to 2"), variables),
			});
		}
		filter = filterOf(combine === "or" ? "or" : "and", conditions, node.id);
	}

	const schema = schemaOf("If");
	const base = schema.configurations![0]!;
	return {
		...node,
		base: { ...node.base, ...schema },
		configurations: [{ id: `${node.id}:conditions`, base, binding: null, value: filter }],
	};
}

function migrateSwitch(node: IActionRuntime, variables: IVariableRuntime[]): IActionRuntime {
	const { byName, rows, caseCells } = oldConfigs(node);
	const rule = (n: number, condition: Omit<IFilterConditionSchema, "id">) =>
		({ conditions: filterOf("and", [condition], `${node.id}-r${n}`), outputKey: "" });

	const rules = rows.length > 0
		? rows.map((row, i) => rule(i + 1, { leftValue: operand(row.value, variables), operator: operationOf(row), rightValue: operand(row.compare, variables) }))
		: caseCells.map(({ config }, i) => rule(i + 1, {
			leftValue: operand(byName.get("Value"), variables),
			operator: OPERATION[String(byName.get("Match")?.value ?? "eq")] ?? "string:equals",
			rightValue: operand(config, variables),
		}));

	const schema = schemaOf("Switch");
	const base = schema.configurations![0]!;
	// Its outputs as they are (case_N, Default): what its wires point at — synced to the rules below.
	return syncDynamicOutputs({
		...node,
		base: { ...node.base, ...schema, outputs: node.base.outputs },
		configurations: [{ id: `${node.id}:rules`, base, binding: null, value: { values: rules } }],
	});
}

/** Whether `node` carries an older shape's configs. */
const isOlder = (node: IActionRuntime) =>
	node.configurations.some(config => FIRST_SHAPE.has(config.base.displayName) || ROW.test(config.base.displayName) || /^Case \d+$/.test(config.base.displayName));

/** `workflow` with its If / Switch nodes of an older shape in today's — the same workflow when it has none. */
export function migrateLegacyLogic<T extends IWorkflowRuntime>(workflow: T): T {
	const variables = workflow.variables ?? [];
	let changed = false;
	const components = workflow.components.map(component => {
		if (!isLogicComponent(component)) return component;
		const actions = component.actions.map(node => {
			if (!isOlder(node)) return node;
			if (node.base.displayName === "If") { changed = true; return migrateIf(node, variables); }
			if (node.base.displayName === "Switch") { changed = true; return migrateSwitch(node, variables); }
			return node;
		});
		return actions.some((node, i) => node !== component.actions[i]) ? { ...component, actions } : component;
	});
	return changed ? { ...workflow, components } : workflow;
}
