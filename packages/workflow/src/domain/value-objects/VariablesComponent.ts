import type { IComponentSchema } from "../entities/IComponent.schema.js";

// The built-in "Variables" component: its "Set" action writes a workflow
// variable on the board. Like the Start action it has no package and no script
// on the device — the platform's ExecuteCommand handles its ACTION_ID itself,
// generateId("variables/set") (computeWireActionId of displayName "Variables"
// + action "Set"), because only the runtime can reach GlobalVariables.
//
// It's an ordinary entry of workflow.components (packageId below), added the
// first time a variable is created (see AddWorkflowVariable), so nodes,
// connections, the action picker and the collab doc need nothing special.
// Package sync and the board build skip it: its packageId resolves to no
// package (see SyncWorkflow / UpdateWorkflow).

export const VARIABLES_PACKAGE_ID = "core:variables";

// Wire config ids: computeWireConfigId → generateId("set/variable"), generateId("set/value").
export const VariablesComponentSchema: IComponentSchema = {
	displayName: "Variables",
	description: "Workflow-global values — shared by every action and kept across loops of the program.",
	actions: [
		{
			displayName: "Set",
			description: "Stores a value in a workflow variable. Any config can then read it (drag the variable onto the field), and scripts read it with ctx.var(\"name\").",
			// No module behind it — handled by the platform's ExecuteCommand.
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
					description: "What to store — a literal, or bind it to an output, another variable or a script.",
					type: "any",
					availables: ["int", "float", "bool"],
					defaultValue: { kind: "int", value: 0 },
				},
			],
		},
		// List / object variables (handled by the platform's ExecuteCommand too —
		// "variables/append", "variables/set field", "variables/clear").
		{
			displayName: "Append",
			description: "Adds an item to the end of a list variable — a reading to a history, say. Max Items keeps only the newest; past the board's value size the oldest go too.",
			script: "",
			configurations: [
				{ displayName: "Variable", description: "The list variable to add to.", type: "variable", required: true },
				{
					displayName: "Value",
					description: "The item — bind it to an output (a number, text, an object…), a variable or a script, or type a number.",
					type: "any",
					availables: ["int", "float", "bool"],
					defaultValue: { kind: "float", value: 0 },
				},
				{
					displayName: "Max Items",
					description: "How many it keeps — the oldest go first. Empty: as many as fit.",
					type: "number",
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
					availables: ["int", "float", "bool"],
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
	],
};

/** Whether it's the built-in Variables component. */
export const isVariablesComponent = (component: { packageId: string }) => component.packageId === VARIABLES_PACKAGE_ID;
