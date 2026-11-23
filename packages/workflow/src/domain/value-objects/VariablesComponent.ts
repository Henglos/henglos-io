import type { IComponentSchema } from "../entities/IComponent.schema.js";
import { VALUE_TYPES } from "../wire/DataType.js";

// The built-in "Variables" component: its actions read and write the
// workflow's variables on the board. Like Start and Logic it has no package —
// its actions ship with the platform's runtime (hio/system/core/builtin/
// variables, registered as "variables/<action>": computeWireActionId of
// displayName "Variables" + the action's name), since only the runtime can
// reach GlobalVariables.
//
// It's an ordinary entry of workflow.components (packageId below), added the
// first time a variable is created (see AddWorkflowVariable), so nodes,
// connections, the action picker and the collab doc need nothing special.
// Package sync and the board build skip it: its packageId resolves to no
// package (see SyncWorkflow / UpdateWorkflow).
//
// A "variable" config carries which variable as its VARIABLE_ID (a LITERAL
// INTEGER) — the runtime's ActionContext.target reads it back.

export const VARIABLES_PACKAGE_ID = "core:variables";

// Wire config ids: computeWireConfigId → generateId("set/variable"), generateId("set/value")…
export const VariablesComponentSchema: IComponentSchema = {
	displayName: "Variables",
	description: "Workflow-global values — shared by every action and kept across loops of the program.",
	actions: [
		{
			displayName: "Set",
			description: "Stores a value in a workflow variable. Any config can then read it (drag the variable onto the field), and scripts read it with ctx.var(\"name\").",
			// No module behind it in a package — it's the runtime's (builtin/variables).
			script: "",
			configurations: [
				{
					displayName: "Variable",
					description: "The variable to write.",
					type: "variable",
					required: true,
				},
				{
					displayName: "Value",
					description: "What to store — typed in as the variable's type, or bind it to an output, another variable or a script.",
					type: "any",
					availables: [...VALUE_TYPES],
					defaultValue: { kind: "integer", value: 0 },
				},
			],
		},
		// List / object variables.
		{
			displayName: "Append",
			description: "Adds an item to the end of a list variable — a reading to a history, say. Max Items keeps only the newest; past the board's value size the oldest go too.",
			script: "",
			configurations: [
				{ displayName: "Variable", description: "The list variable to add to.", type: "variable", required: true },
				{
					displayName: "Value",
					description: "The item — a number, a string, a list, an object… typed in, or bind it to an output, a variable or a script.",
					type: "any",
					availables: [...VALUE_TYPES],
					defaultValue: { kind: "float", value: 0 },
				},
				{
					displayName: "Max Items",
					description: "How many it keeps — the oldest go first. Empty: as many as fit.",
					type: "integer",
					placeholder: "e.g. 20",
					patterns: [{ name: "Min", value: 1 }],
				},
			],
		},
		{
			displayName: "Set Field",
			description: "Sets one field of an object variable — adds it if it isn't there.",
			script: "",
			configurations: [
				{ displayName: "Variable", description: "The object variable.", type: "variable", required: true },
				{ displayName: "Field", description: "The field's name.", type: "string", required: true, placeholder: "e.g. temperature" },
				{
					displayName: "Value",
					description: "Its value — a literal, or bind it to an output, a variable or a script.",
					type: "any",
					availables: [...VALUE_TYPES],
					defaultValue: { kind: "float", value: 0 },
				},
			],
		},
		{
			displayName: "Clear",
			description: "Empties a list or object variable.",
			script: "",
			configurations: [
				{ displayName: "Variable", description: "The list or object variable to empty.", type: "variable", required: true },
			],
		},
		{
			displayName: "Remove",
			description: "Takes a variable's value away — configs bound to it get nothing until a Set writes it again.",
			script: "",
			configurations: [
				{ displayName: "Variable", description: "The variable to empty out.", type: "variable", required: true },
			],
		},
	],
};

/** Whether it's the built-in Variables component. */
export const isVariablesComponent = (component: { packageId: string }) => component.packageId === VARIABLES_PACKAGE_ID;
