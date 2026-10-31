import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { LOGIC_COMPONENT_ID, LogicComponentSchema } from "../../../domain/value-objects/LogicComponent.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { AddConnectionToWorkflow } from "./AddConnection.use-case.js";
import { AddSwitchCase, MAX_SWITCH_CASES, RemoveSwitchCase, switchCaseCount } from "./SwitchCases.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";
import { computeWireOutputId, getActionOutputs } from "./ResolveNextAction.use-case.js";
import { generateId } from "../../../utils/identifier.js";
import { UpdateWorkflowActionConfiguration } from "./UpdateActionConfiguration.use-case.js";

const withSwitch = () => {
	const workflow: IWorkflowRuntime = new CreateWorkflow().execute("wf", "", { name: "esp32", displayName: "ESP32", description: "", pins: [] } as never, "board-pkg");
	const schema = LogicComponentSchema.actions!.find(action => action.displayName === "Switch")!;
	const result = new AddActionToWorkflowComponent().execute(workflow, LOGIC_COMPONENT_ID, schema);
	return { workflow: result.workflow, id: result.action!.id };
};

const node = (workflow: IWorkflowRuntime, id: string) =>
	workflow.components.flatMap(component => component.actions).find(action => action.id === id)!;

describe("Switch cases", () => {

	it("adds Case 4 — its config, and its output before Default", () => {
		const { workflow, id } = withSwitch();
		const added = new AddSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);
		const action = node(added, id);
		expect(switchCaseCount(action)).toBe(4);
		expect(action.base.outputs!.map(handle => handle.id)).toEqual(["case_1", "case_2", "case_3", "case_4", "otherwise"]);
		expect(action.outputs.map(handle => handle.base.id)).toEqual(["case_1", "case_2", "case_3", "case_4", "otherwise"]);
		expect(action.configurations.some(config => config.base.displayName === "Case 4")).toBe(true);
		// Its wire id: the board goes out on generateId("case_4").
		const handle = getActionOutputs(action).find(output => output.base.id === "case_4")!;
		expect(computeWireOutputId(action, handle.base.id)).toBe(generateId("case_4"));
	});

	it("sends the new case's value like the others", () => {
		const { workflow, id } = withSwitch();
		const added = new AddSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);
		expect(new GenerateExecuteCommand().execute(added, id)).toBeDefined();
	});

	it("stops at MAX_SWITCH_CASES", () => {
		let { workflow, id } = withSwitch();
		for (let i = 0; i < 20; i++) workflow = new AddSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);
		expect(switchCaseCount(node(workflow, id))).toBe(MAX_SWITCH_CASES);
	});

	it("removes the last case and the wires leaving it — keeping one at least", () => {
		let { workflow, id } = withSwitch();
		workflow = new AddSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);
		const handle = node(workflow, id).outputs.find(output => output.base.id === "case_4")!;
		const target = new AddActionToWorkflowComponent().execute(workflow, LOGIC_COMPONENT_ID, LogicComponentSchema.actions!.find(action => action.displayName === "If")!);
		workflow = target.workflow;
		workflow = new AddConnectionToWorkflow().execute(workflow, id, target.action!.id, handle.id, target.action!.inputs[0]!.id).workflow;
		const wired = workflow.connections.length;
		expect(wired).toBeGreaterThan(0);

		workflow = new RemoveSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);
		expect(switchCaseCount(node(workflow, id))).toBe(3);
		expect(workflow.connections.length).toBe(wired - 1);

		for (let i = 0; i < 5; i++) workflow = new RemoveSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);
		expect(switchCaseCount(node(workflow, id))).toBe(1);
	});

	it("removes a case from the middle — the ones after it move up, with their values and wires", () => {
		let { workflow, id } = withSwitch();
		workflow = new AddSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);              // Case 1…4
		const configOf = (name: string) => node(workflow, id).configurations.find(config => config.base.displayName === name)!;
		workflow = new UpdateWorkflowActionConfiguration().execute(workflow, LOGIC_COMPONENT_ID, id, configOf("Case 3").id, "three");
		workflow = new UpdateWorkflowActionConfiguration().execute(workflow, LOGIC_COMPONENT_ID, id, configOf("Case 4").id, "four");

		const target = new AddActionToWorkflowComponent().execute(workflow, LOGIC_COMPONENT_ID, LogicComponentSchema.actions!.find(action => action.displayName === "If")!);
		workflow = target.workflow;
		const case3 = node(workflow, id).outputs.find(output => output.base.id === "case_3")!;
		workflow = new AddConnectionToWorkflow().execute(workflow, id, target.action!.id, case3.id, target.action!.inputs[0]!.id).workflow;

		workflow = new RemoveSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id, 2);
		const action = node(workflow, id);
		expect(switchCaseCount(action)).toBe(3);
		expect(action.base.outputs!.map(handle => handle.id)).toEqual(["case_1", "case_2", "case_3", "otherwise"]);
		// The old Case 3 is Case 2: its value, and its wire (the same handle).
		expect(configOf("Case 2").value).toBe("three");
		expect(configOf("Case 3").value).toBe("four");
		const moved = action.outputs.find(output => output.id === case3.id)!;
		expect(moved.base).toEqual({ id: "case_2", name: "Case 2" });
		expect(workflow.connections.some(c => c.source === id && c.sourceHandle === case3.id)).toBe(true);
		// And the board goes out on it as case_2.
		expect(computeWireOutputId(action, moved.base.id)).toBe(generateId("case_2"));
	});

});
