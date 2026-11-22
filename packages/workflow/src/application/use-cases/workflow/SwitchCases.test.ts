import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { LOGIC_COMPONENT_ID, LogicComponentSchema } from "../../../domain/value-objects/LogicComponent.js";
import { DataType, isSizedDataType } from "../../../domain/wire/DataType.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { AddConnectionToWorkflow } from "./AddConnection.use-case.js";
import { AddSwitchCase } from "./AddSwitchCase.use-case.js";
import { RemoveSwitchCase } from "./RemoveSwitchCase.use-case.js";
import { MoveSwitchCase } from "./MoveSwitchCase.use-case.js";
import { caseNumber, MAX_SWITCH_CASES, switchCaseCount } from "./SwitchCases.js";
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

const configOf = (workflow: IWorkflowRuntime, id: string, name: string) =>
	node(workflow, id).configurations.find(config => config.base.displayName === name)!;

const setValue = (workflow: IWorkflowRuntime, id: string, name: string, value: string) =>
	new UpdateWorkflowActionConfiguration().execute(workflow, LOGIC_COMPONENT_ID, id, configOf(workflow, id, name).id, value);

/** Wires Switch `id`'s output `handleId` to a new If — the connection's source handle. */
const wire = (workflow: IWorkflowRuntime, id: string, handleId: string) => {
	const handle = node(workflow, id).outputs.find(output => output.base.id === handleId)!;
	const target = new AddActionToWorkflowComponent().execute(workflow, LOGIC_COMPONENT_ID, LogicComponentSchema.actions!.find(action => action.displayName === "If")!);
	const wired = new AddConnectionToWorkflow().execute(target.workflow, id, target.action!.id, handle.id, target.action!.inputs[0]!.id).workflow;
	return { workflow: wired, handle: handle.id };
};

/** CONFIG_ID → its text, for the LITERAL entries of an EXECUTE body (all a Switch with typed-in values sends). */
const literals = (payload: Uint8Array) => {
	const view = new DataView(payload.buffer);
	const found = new Map<number, string>();
	let index = 6 + payload[5]! * 4;
	while (index < payload.length) {
		const dataType = payload[index + 3]!;
		const sized = isSizedDataType(dataType);
		const size = sized ? view.getUint16(index + 4, true) : dataType === DataType.BOOL ? 1 : 4;
		const start = index + 4 + (sized ? 2 : 0);
		found.set(view.getUint16(index, true), new TextDecoder().decode(payload.slice(start, start + size)));
		index = start + size;
	}
	return found;
};

describe("Switch cases", () => {

	it("starts with two cases, each a value, an operation and a compare to", () => {
		const { workflow, id } = withSwitch();
		const action = node(workflow, id);
		expect(switchCaseCount(action)).toBe(2);
		expect(action.configurations.map(config => config.base.displayName)).toEqual([
			"Case 1 value", "Case 1 operation", "Case 1 compare to",
			"Case 2 value", "Case 2 operation", "Case 2 compare to",
		]);
		expect(configOf(workflow, id, "Case 1 operation").value).toBe("string:equals");
		expect(action.outputs.map(handle => handle.base.id)).toEqual(["case_1", "case_2", "otherwise"]);
	});

	it("sends a case under the ids the board reads — switch/case N value, operation, compare to", () => {
		let { workflow, id } = withSwitch();
		workflow = setValue(workflow, id, "Case 1 value", "1");
		workflow = setValue(workflow, id, "Case 1 compare to", "1");
		const sent = literals(new GenerateExecuteCommand().execute(workflow, id)!);
		expect(sent.get(generateId("switch/case 1 value"))).toBe("1");
		expect(sent.get(generateId("switch/case 1 operation"))).toBe("string:equals");
		expect(sent.get(generateId("switch/case 1 compare to"))).toBe("1");
		expect(sent.get(generateId("switch/case 2 operation"))).toBe("string:equals");
	});

	it("doesn't send Compare to for an operation that only looks at the value", () => {
		let { workflow, id } = withSwitch();
		workflow = setValue(workflow, id, "Case 1 compare to", "x");
		workflow = setValue(workflow, id, "Case 1 operation", "boolean:is_true");
		const sent = literals(new GenerateExecuteCommand().execute(workflow, id)!);
		expect(sent.get(generateId("switch/case 1 operation"))).toBe("boolean:is_true");
		expect(sent.has(generateId("switch/case 1 compare to"))).toBe(false);
	});

	it("adds Case 3 — its configs, and its output before Default", () => {
		const { workflow, id } = withSwitch();
		const added = new AddSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);
		const action = node(added, id);
		expect(switchCaseCount(action)).toBe(3);
		expect(action.base.outputs!.map(handle => handle.id)).toEqual(["case_1", "case_2", "case_3", "otherwise"]);
		expect(action.outputs.map(handle => handle.base.id)).toEqual(["case_1", "case_2", "case_3", "otherwise"]);
		expect(action.configurations.filter(config => caseNumber(config.base.displayName) === 3).map(config => config.base.displayName))
			.toEqual(["Case 3 value", "Case 3 operation", "Case 3 compare to"]);
		expect(configOf(added, id, "Case 3 operation").value).toBe("string:equals");
		// Its wire id: the board goes out on generateId("case_3").
		const handle = getActionOutputs(action).find(output => output.base.id === "case_3")!;
		expect(computeWireOutputId(action, handle.base.id)).toBe(generateId("case_3"));
		expect(literals(new GenerateExecuteCommand().execute(added, id)!).has(generateId("switch/case 3 operation"))).toBe(true);
	});

	it("stops at MAX_SWITCH_CASES — and still fits a board's configs per command", () => {
		let { workflow, id } = withSwitch();
		for (let i = 0; i < 20; i++) workflow = new AddSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);
		expect(switchCaseCount(node(workflow, id))).toBe(MAX_SWITCH_CASES);
	});

	it("removes the last case and the wires leaving it — keeping one at least", () => {
		let { workflow, id } = withSwitch();
		workflow = new AddSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);             // Case 1…3
		({ workflow } = wire(workflow, id, "case_3"));
		const wired = workflow.connections.length;

		workflow = new RemoveSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);
		expect(switchCaseCount(node(workflow, id))).toBe(2);
		expect(node(workflow, id).configurations.some(config => caseNumber(config.base.displayName) === 3)).toBe(false);
		expect(workflow.connections.length).toBe(wired - 1);

		for (let i = 0; i < 5; i++) workflow = new RemoveSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);
		expect(switchCaseCount(node(workflow, id))).toBe(1);
	});

	it("removes a case from the middle — the ones after it move up, with their values and wires", () => {
		let { workflow, id } = withSwitch();
		workflow = new AddSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);
		workflow = new AddSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);             // Case 1…4
		workflow = setValue(workflow, id, "Case 3 value", "three");
		workflow = setValue(workflow, id, "Case 3 operation", "number:gt");
		workflow = setValue(workflow, id, "Case 4 value", "four");
		const wired = wire(workflow, id, "case_3");
		workflow = wired.workflow;

		workflow = new RemoveSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id, 2);
		const action = node(workflow, id);
		expect(switchCaseCount(action)).toBe(3);
		expect(action.base.outputs!.map(handle => handle.id)).toEqual(["case_1", "case_2", "case_3", "otherwise"]);
		// The old Case 3 is Case 2: all of its configs, and its wire (the same handle).
		expect(configOf(workflow, id, "Case 2 value").value).toBe("three");
		expect(configOf(workflow, id, "Case 2 operation").value).toBe("number:gt");
		expect(configOf(workflow, id, "Case 3 value").value).toBe("four");
		const moved = action.outputs.find(output => output.id === wired.handle)!;
		expect(moved.base).toEqual({ id: "case_2", name: "Case 2" });
		expect(workflow.connections.some(c => c.source === id && c.sourceHandle === wired.handle)).toBe(true);
		expect(computeWireOutputId(action, moved.base.id)).toBe(generateId("case_2"));
		// Its Compare to's visibility follows its new number's operation.
		expect(configOf(workflow, id, "Case 2 compare to").base.displayOptions).toEqual(
			{ hide: { "Case 2 operation": expect.any(Array) } });
	});

	it("moves a case — the ones in between shift, each with its values and wires", () => {
		let { workflow, id } = withSwitch();
		workflow = new AddSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id);             // Case 1…3
		workflow = setValue(workflow, id, "Case 1 value", "one");
		workflow = setValue(workflow, id, "Case 2 value", "two");
		workflow = setValue(workflow, id, "Case 3 value", "three");
		workflow = setValue(workflow, id, "Case 3 operation", "number:lt");
		const wired = wire(workflow, id, "case_3");
		workflow = wired.workflow;

		workflow = new MoveSwitchCase().execute(workflow, LOGIC_COMPONENT_ID, id, 3, 1);
		const action = node(workflow, id);
		expect(switchCaseCount(action)).toBe(3);
		expect([1, 2, 3].map(n => configOf(workflow, id, `Case ${n} value`).value)).toEqual(["three", "one", "two"]);
		expect(configOf(workflow, id, "Case 1 operation").value).toBe("number:lt");
		// Configs and outputs in case order, Default last.
		expect(action.configurations.map(config => caseNumber(config.base.displayName))).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
		expect(action.outputs.map(handle => handle.base.id)).toEqual(["case_1", "case_2", "case_3", "otherwise"]);
		expect(action.base.outputs!.map(handle => handle.id)).toEqual(["case_1", "case_2", "case_3", "otherwise"]);
		// The wire stays on its handle, which goes out case_1 now.
		const moved = action.outputs.find(output => output.id === wired.handle)!;
		expect(moved.base).toEqual({ id: "case_1", name: "Case 1" });
		expect(workflow.connections.some(c => c.source === id && c.sourceHandle === wired.handle)).toBe(true);
		// And the board tests it first.
		expect(literals(new GenerateExecuteCommand().execute(workflow, id)!).get(generateId("switch/case 1 value"))).toBe("three");
	});

	it("ignores a move to where it is, or out of range", () => {
		const { workflow, id } = withSwitch();
		const move = new MoveSwitchCase();
		expect(move.execute(workflow, LOGIC_COMPONENT_ID, id, 1, 1)).toBe(workflow);
		expect(move.execute(workflow, LOGIC_COMPONENT_ID, id, 1, 3)).toBe(workflow);
		expect(move.execute(workflow, LOGIC_COMPONENT_ID, id, 0, 1)).toBe(workflow);
	});

	it("leaves an action that isn't a Switch as it was", () => {
		const { workflow } = withSwitch();
		const ifAction = new AddActionToWorkflowComponent().execute(workflow, LOGIC_COMPONENT_ID, LogicComponentSchema.actions!.find(action => action.displayName === "If")!);
		const id = ifAction.action!.id;
		expect(new AddSwitchCase().execute(ifAction.workflow, LOGIC_COMPONENT_ID, id)).toBe(ifAction.workflow);
		expect(new RemoveSwitchCase().execute(ifAction.workflow, LOGIC_COMPONENT_ID, id)).toBe(ifAction.workflow);
		expect(new MoveSwitchCase().execute(ifAction.workflow, LOGIC_COMPONENT_ID, id, 1, 2)).toBe(ifAction.workflow);
	});

});
