import type { IComponentSchema } from "../entities/IComponent.schema.js";
import type { IComponentRuntime } from "../entities/IComponent.runtime.js";
import type { IConfigurationSchema, IOptionEntrySchema } from "../entities/IConfiguration.schema.js";
import { VARIABLES_PACKAGE_ID } from "./VariablesComponent.js";

// The built-in "Logic" component: If, Switch and Repeat — the flow's
// branching. Same deal as Variables (see VariablesComponent.ts): no package
// and no script on the device — the platform's ExecuteCommand handles their
// ACTION_IDs itself (generateId("logic/if"), "logic/switch", "logic/repeat"),
// and package sync and the board build skip it (its packageId resolves to no
// package).
//
// Unlike Variables it's in every workflow's action pickers from the start,
// without being in workflow.components: it has a fixed component id, and
// adding one of its actions adds the component first (see withLogicComponent),
// so a workflow that never branches doesn't carry it.
//
// Their conditions (If's, each Switch case's) are a value, an operation and
// a compare-to (n8n style): the value is a "string" config, so it can be typed
// or bound (an output, a variable, Python); the operation, "<type>:<operation>",
// says which type both sides are read as on the board (builtin/flow/operators.py).

export const LOGIC_PACKAGE_ID = "core:logic";
/** The Logic component's id in a workflow. */
export const LOGIC_COMPONENT_ID = "core:logic";

const OPERAND = "A literal, or bind it to an output, a variable or a script.";

// The operations, grouped by the type the value is read as: "<type>:<operation>".
const operations = (type: string, entries: [string, string][]): IOptionEntrySchema => ({
	categoryName: type[0]!.toUpperCase() + type.slice(1),
	options: entries.map(([value, displayName]) => ({ displayName, value: `${type}:${value}` })),
});

const PRESENCE: [string, string][] = [["exists", "exists"], ["not_exists", "does not exist"]];
const EMPTINESS: [string, string][] = [["is_empty", "is empty"], ["is_not_empty", "is not empty"]];

/** What a condition (If's, a Switch case's) can test. */
export const LOGIC_OPERATIONS: IOptionEntrySchema[] = [
	operations("string", [
		...PRESENCE, ...EMPTINESS,
		["equals", "is equal to"], ["not_equals", "is not equal to"],
		["contains", "contains"], ["not_contains", "does not contain"],
		["starts_with", "starts with"], ["not_starts_with", "does not start with"],
		["ends_with", "ends with"], ["not_ends_with", "does not end with"],
		["regex", "matches regex"], ["not_regex", "does not match regex"],
	]),
	operations("number", [
		...PRESENCE,
		["equals", "is equal to"], ["not_equals", "is not equal to"],
		["gt", "is greater than"], ["lt", "is less than"],
		["gte", "is greater than or equal to"], ["lte", "is less than or equal to"],
	]),
	operations("boolean", [
		...PRESENCE,
		["is_true", "is true"], ["is_false", "is false"],
		["equals", "is equal to"], ["not_equals", "is not equal to"],
	]),
	operations("array", [
		...PRESENCE, ...EMPTINESS,
		["contains", "contains"], ["not_contains", "does not contain"],
		["length_equals", "length equal to"], ["length_not_equals", "length not equal to"],
		["length_gt", "length greater than"], ["length_lt", "length less than"],
		["length_gte", "length greater than or equal to"], ["length_lte", "length less than or equal to"],
	]),
	operations("object", [...PRESENCE, ...EMPTINESS]),
];

/** Operations that only look at the value — no compare-to. */
export const LOGIC_UNARY_OPERATIONS = LOGIC_OPERATIONS.flatMap(entry => "options" in entry ? entry.options : [entry])
	.map(option => option.value)
	.filter(value => /:(exists|not_exists|is_empty|is_not_empty|is_true|is_false)$/.test(value));

/** @deprecated The same as LOGIC_OPERATIONS — Switch's and If's. */
export const SWITCH_OPERATIONS = LOGIC_OPERATIONS;
/** @deprecated The same as LOGIC_UNARY_OPERATIONS. */
export const SWITCH_UNARY_OPERATIONS = LOGIC_UNARY_OPERATIONS;

/** A filter with one empty condition — what If's Conditions and each Switch rule start with. */
const oneCondition = () => ({
	combinator: "and" as const,
	conditions: [{ id: "c1", leftValue: "", operator: "string:equals", rightValue: "" }],
});

/** If's conditions: a filter — n8n's If. */
const IF_CONDITIONS: IConfigurationSchema = {
	displayName: "Conditions",
	name: "conditions",
	description: "What has to hold for True — drag an output or a variable onto a value to use it.",
	type: "filter",
	defaultValue: oneCondition(),
};

/** Switch's rules: a row each — its conditions, and its output's name — n8n's Switch. */
const SWITCH_RULES: IConfigurationSchema = {
	displayName: "Routing Rules",
	name: "rules",
	description: "Out the first rule whose conditions hold — each rule its own output, then Default.",
	type: "fixedCollection",
	placeholder: "Add Routing Rule",
	multipleValues: true,
	defaultValue: { values: [{ conditions: oneCondition(), outputKey: "" }, { conditions: oneCondition(), outputKey: "" }] },
	options: [{
		name: "values",
		displayName: "Rule",
		values: [
			{ displayName: "Conditions", name: "conditions", description: "", type: "filter", defaultValue: oneCondition() },
			{ displayName: "Output Name", name: "outputKey", description: "The output's name — Case N when empty.", type: "string", placeholder: "Case N" },
		],
	}],
};

/** The built-in Logic component: If, Switch and Repeat. */
export const LogicComponentSchema: IComponentSchema = {
	displayName: "Logic",
	description: "Branch the flow: If, Switch and Repeat — built in, nothing to install.",
	actions: [
		{
			displayName: "If",
			description: "Goes out True when its conditions hold — all of them (AND) or any one (OR) — and False otherwise.",
			script: "",
			outputs: [
				{ id: "true", name: "True" },
				{ id: "false", name: "False" },
			],
			configurations: [IF_CONDITIONS],
		},
		{
			displayName: "Switch",
			description: "Routes the flow: out the first rule whose conditions hold, or Default when none does.",
			script: "",
			// An output per rule (case_1, case_2…), then Default.
			outputs: [{ id: "otherwise", name: "Default" }],
			dynamicOutputs: { property: "rules", group: "values", labelField: "outputKey", idPrefix: "case", namePrefix: "Case" },
			configurations: [SWITCH_RULES],
		},
		{
			displayName: "Repeat",
			description: "Runs the Loop branch a number of times, then goes out Done. Wire the loop's last action back into Repeat.",
			script: "",
			outputs: [
				{ id: "loop", name: "Loop" },
				{ id: "done", name: "Done" },
			],
			outputSchema: [
				{ name: "iteration", type: "integer", description: "Which time round this is — 1 on the first loop." },
			],
			configurations: [
				{ displayName: "Times", description: "How many times the Loop branch runs before Done.", type: "integer", defaultValue: "3", required: true },
			],
		},
	],
};

/** Whether it's the built-in Logic component. */
export const isLogicComponent = (component: { packageId: string }) => component.packageId === LOGIC_PACKAGE_ID;

/** Built in: no package behind it, nothing to install, sync or build. */
export const isCoreComponent = (component: { packageId: string }) =>
	component.packageId === LOGIC_PACKAGE_ID || component.packageId === VARIABLES_PACKAGE_ID;

const logicComponent = (): IComponentRuntime => ({
	id: LOGIC_COMPONENT_ID,
	packageId: LOGIC_PACKAGE_ID,
	alias: LogicComponentSchema.displayName,
	base: LogicComponentSchema,
	actions: [],
});

/** `workflow` with the Logic component in it — first among the components, when it wasn't there yet. */
export const withLogicComponent = <T extends { components: IComponentRuntime[] }>(workflow: T): T =>
	workflow.components.some(isLogicComponent)
		? workflow
		: { ...workflow, components: [logicComponent(), ...workflow.components] };
