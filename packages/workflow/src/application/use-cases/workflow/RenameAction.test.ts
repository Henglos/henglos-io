import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { LOGIC_COMPONENT_ID, LogicComponentSchema } from "../../../domain/value-objects/LogicComponent.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { MAX_ACTION_ALIAS_LENGTH, RenameWorkflowAction, uniqueActionAlias } from "./RenameAction.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";

const withIf = () => {
	const workflow: IWorkflowRuntime = new CreateWorkflow().execute("wf", "", { name: "esp32", displayName: "ESP32", description: "", pins: [] } as never, "board-pkg");
	const result = new AddActionToWorkflowComponent().execute(workflow, LOGIC_COMPONENT_ID, LogicComponentSchema.actions!.find(action => action.displayName === "If")!);
	return { workflow: result.workflow, id: result.action!.id };
};

const aliasOf = (workflow: IWorkflowRuntime, id: string) =>
	workflow.components.flatMap(component => component.actions).find(action => action.id === id)!.alias;

describe("renaming a node", () => {

	const rename = new RenameWorkflowAction();

	it("takes the name trimmed — and the action's own when left empty", () => {
		const { workflow, id } = withIf();
		const renamed = rename.execute(workflow, LOGIC_COMPONENT_ID, id, "  Is it hot?  ");
		expect(aliasOf(renamed, id)).toBe("Is it hot?");
		expect(aliasOf(rename.execute(renamed, LOGIC_COMPONENT_ID, id, "   "), id)).toBe("If");
	});

	it("cuts a long name", () => {
		const { workflow, id } = withIf();
		expect(aliasOf(rename.execute(workflow, LOGIC_COMPONENT_ID, id, "x".repeat(100)), id)).toHaveLength(MAX_ACTION_ALIAS_LENGTH);
	});

	it("renames Start too", () => {
		const { workflow } = withIf();
		expect(rename.execute(workflow, "", workflow.start.id, "Boot").start.alias).toBe("Boot");
	});

	it("changes nothing sent to the board", () => {
		const { workflow, id } = withIf();
		const renamed = rename.execute(workflow, LOGIC_COMPONENT_ID, id, "Is it hot?");
		const generate = new GenerateExecuteCommand();
		expect(generate.execute(renamed, id)).toEqual(generate.execute(workflow, id));
	});

	it("numbers a name another node has — ignoring case", () => {
		const { workflow, id } = withIf();
		expect(aliasOf(rename.execute(workflow, LOGIC_COMPONENT_ID, id, "start"), id)).toBe("start 2");
	});

	it("keeps its own name — renaming to it isn't a clash", () => {
		const { workflow, id } = withIf();
		expect(aliasOf(rename.execute(workflow, LOGIC_COMPONENT_ID, id, "If"), id)).toBe("If");
	});

	it("leaves the workflow as it was for a node it doesn't have", () => {
		const { workflow } = withIf();
		expect(rename.execute(workflow, LOGIC_COMPONENT_ID, "nope", "x")).toBe(workflow);
	});

});

describe("no two nodes share a name", () => {

	const ifSchema = LogicComponentSchema.actions!.find(action => action.displayName === "If")!;
	const add = new AddActionToWorkflowComponent();

	it("a second If is If 2, a third If 3", () => {
		const first = withIf();
		const second = add.execute(first.workflow, LOGIC_COMPONENT_ID, ifSchema);
		const third = add.execute(second.workflow, LOGIC_COMPONENT_ID, ifSchema);
		expect(second.action!.alias).toBe("If 2");
		expect(third.action!.alias).toBe("If 3");
	});

	it("a copy of If 2 is the next free number, within the length", () => {
		const { workflow, id } = withIf();
		const second = add.execute(workflow, LOGIC_COMPONENT_ID, ifSchema);
		expect(uniqueActionAlias(second.workflow, "If 2", "new")).toBe("If 3");
		expect(uniqueActionAlias(second.workflow, "Free", "new")).toBe("Free");
		const long = new RenameWorkflowAction().execute(second.workflow, LOGIC_COMPONENT_ID, id, "x".repeat(MAX_ACTION_ALIAS_LENGTH));
		expect(uniqueActionAlias(long, "x".repeat(MAX_ACTION_ALIAS_LENGTH), "new")).toBe(`${"x".repeat(MAX_ACTION_ALIAS_LENGTH - 2)} 2`);
	});

});
