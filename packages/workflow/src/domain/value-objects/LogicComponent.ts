import type { IComponentSchema } from "../entities/IComponent.schema.js";
import type { IComponentRuntime } from "../entities/IComponent.runtime.js";
import type { IOptionEntrySchema } from "../entities/IConfiguration.schema.js";
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
// The operands are "string" configs, so each can be typed or bound (an
// output, a variable, Python) — the board compares what it gets: as numbers
// when both sides read as numbers, as text otherwise (see Logic.py).

export const LOGIC_PACKAGE_ID = "core:logic";
/** The Logic component's id in a workflow. */
export const LOGIC_COMPONENT_ID = "core:logic";

// Conditions that don't look at a second operand.
export const UNARY_CONDITIONS = ["is_true", "is_false", "is_empty", "is_not_empty"];

const COMPARISONS: IOptionEntrySchema[] = [
	{
		categoryName: "Compare",
		options: [
			{ displayName: "is equal to", value: "eq" },
			{ displayName: "is not equal to", value: "ne" },
			{ displayName: "is greater than", value: "gt" },
			{ displayName: "is greater than or equal to", value: "gte" },
			{ displayName: "is less than", value: "lt" },
			{ displayName: "is less than or equal to", value: "lte" },
		],
	},
	{
		categoryName: "Text",
		options: [
			{ displayName: "contains", value: "contains" },
			{ displayName: "does not contain", value: "not_contains" },
			{ displayName: "starts with", value: "starts_with" },
			{ displayName: "ends with", value: "ends_with" },
		],
	},
];

const CONDITIONS: IOptionEntrySchema[] = [
	...COMPARISONS,
	{
		categoryName: "State",
		options: [
			{ displayName: "is true", value: "is_true" },
			{ displayName: "is false", value: "is_false" },
			{ displayName: "is empty", value: "is_empty" },
			{ displayName: "is not empty", value: "is_not_empty" },
		],
	},
];

const OPERAND = "A literal, or bind it to an output, a variable or a script.";

/** The built-in Logic component: If, Switch and Repeat. */
export const LogicComponentSchema: IComponentSchema = {
	displayName: "Logic",
	description: "Branch the flow: If, Switch and Repeat — built in, nothing to install.",
	actions: [
		{
			displayName: "If",
			description: "Goes out True or False, depending on a condition — or on two, joined with AND / OR.",
			script: "",
			outputs: [
				{ id: "true", name: "True" },
				{ id: "false", name: "False" },
			],
			configurations: [
				{ displayName: "Value", description: `What to test. ${OPERAND}`, type: "string", placeholder: "e.g. bind distance" },
				{ displayName: "Condition", description: "How to test it.", type: "options", defaultValue: "eq", options: CONDITIONS },
				{
					displayName: "Compare to",
					description: `What Value is compared with. ${OPERAND}`,
					type: "string",
					placeholder: "e.g. 10",
					displayOptions: { hide: { Condition: UNARY_CONDITIONS } },
				},
				{
					displayName: "Combine",
					description: "Add a second condition: both must hold (AND), or either one (OR).",
					type: "options",
					defaultValue: "none",
					options: [
						{ displayName: "Single condition", value: "none" },
						{ displayName: "AND", value: "and" },
						{ displayName: "OR", value: "or" },
					],
				},
				{
					displayName: "Value 2",
					description: `What the second condition tests. ${OPERAND}`,
					type: "string",
					displayOptions: { show: { Combine: ["and", "or"] } },
				},
				{
					displayName: "Condition 2",
					description: "How to test Value 2.",
					type: "options",
					defaultValue: "eq",
					options: CONDITIONS,
					displayOptions: { show: { Combine: ["and", "or"] } },
				},
				{
					displayName: "Compare to 2",
					description: `What Value 2 is compared with. ${OPERAND}`,
					type: "string",
					displayOptions: { show: { Combine: ["and", "or"] }, hide: { "Condition 2": UNARY_CONDITIONS } },
				},
			],
		},
		{
			displayName: "Switch",
			description: "Routes the flow by value: out the first case that matches, or Default when none does.",
			script: "",
			outputs: [
				{ id: "case_1", name: "Case 1" },
				{ id: "case_2", name: "Case 2" },
				{ id: "case_3", name: "Case 3" },
				{ id: "otherwise", name: "Default" },
			],
			configurations: [
				{ displayName: "Value", description: `What to route on. ${OPERAND}`, type: "string", placeholder: "e.g. bind mode" },
				{ displayName: "Match", description: "How Value is matched against each case.", type: "options", defaultValue: "eq", options: COMPARISONS },
				{ displayName: "Case 1", description: "Out Case 1 when Value matches this. Empty: never.", type: "string", placeholder: "e.g. 1" },
				{ displayName: "Case 2", description: "Out Case 2 when Value matches this. Empty: never.", type: "string" },
				{ displayName: "Case 3", description: "Out Case 3 when Value matches this. Empty: never.", type: "string" },
			],
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
				{ name: "iteration", type: "int", description: "Which time round this is — 1 on the first loop." },
			],
			configurations: [
				{ displayName: "Times", description: "How many times the Loop branch runs before Done.", type: "number", defaultValue: "3", required: true },
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
