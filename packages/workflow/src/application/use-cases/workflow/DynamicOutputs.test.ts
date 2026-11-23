import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { LOGIC_COMPONENT_ID, LogicComponentSchema } from "../../../domain/value-objects/LogicComponent.js";
import { DataType, isSizedDataType } from "../../../domain/wire/DataType.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { AddConnectionToWorkflow } from "./AddConnection.use-case.js";
import { UpdateWorkflowActionConfiguration } from "./UpdateActionConfiguration.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";
import { computeWireOutputId } from "./ResolveNextAction.use-case.js";
import { generateId } from "../../../utils/identifier.js";

const schema = (name: string) => LogicComponentSchema.actions!.find(action => action.displayName === name)!;

const withSwitch = () => {
	const workflow: IWorkflowRuntime = new CreateWorkflow().execute("wf", "", { name: "esp32", displayName: "ESP32", description: "", pins: [] } as never, "board-pkg");
	const added = new AddActionToWorkflowComponent().execute(workflow, LOGIC_COMPONENT_ID, schema("Switch"));
	return { workflow: added.workflow, id: added.action!.id };
};

const node = (workflow: IWorkflowRuntime, id: string) => workflow.components.flatMap(c => c.actions).find(a => a.id === id)!;
const rulesConfig = (workflow: IWorkflowRuntime, id: string) => node(workflow, id).configurations.find(c => c.base.displayName === "Routing Rules")!;

const rule = (left: string, right: string, outputKey = "") => ({
	conditions: { combinator: "and", conditions: [{ id: "c1", leftValue: left, operator: "string:equals", rightValue: right }] },
	outputKey,
});

const setRules = (workflow: IWorkflowRuntime, id: string, rules: unknown[]) =>
	new UpdateWorkflowActionConfiguration().execute(workflow, LOGIC_COMPONENT_ID, id, rulesConfig(workflow, id).id, { values: rules } as never);

/** Wires Switch `id`'s output `handleId` to a new If. */
const wire = (workflow: IWorkflowRuntime, id: string, handleId: string) => {
	const handle = node(workflow, id).outputs.find(output => output.base.id === handleId)!;
	const target = new AddActionToWorkflowComponent().execute(workflow, LOGIC_COMPONENT_ID, schema("If"));
	return { workflow: new AddConnectionToWorkflow().execute(target.workflow, id, target.action!.id, handle.id, target.action!.inputs[0]!.id).workflow, handle: handle.id };
};

describe("outputs from a fixedCollection's rows (dynamicOutputs)", () => {

	it("gives a new Switch an output per default rule, then Default", () => {
		const { workflow, id } = withSwitch();
		expect(node(workflow, id).outputs.map(o => o.base)).toEqual([
			{ id: "case_1", name: "Case 1" },
			{ id: "case_2", name: "Case 2" },
			{ id: "otherwise", name: "Default" },
		]);
	});

	it("adds an output with a rule, names it by its Output Name — the others keep their ids, and wires", () => {
		let { workflow, id } = withSwitch();
		const wired = wire(workflow, id, "case_1");
		workflow = wired.workflow;
		const before = node(workflow, id).outputs.map(o => o.id);

		workflow = setRules(workflow, id, [rule("a", "a"), rule("b", "b"), rule("c", "c", "Third")]);
		const outputs = node(workflow, id).outputs;
		expect(outputs.map(o => o.base)).toEqual([
			{ id: "case_1", name: "Case 1" },
			{ id: "case_2", name: "Case 2" },
			{ id: "case_3", name: "Third" },
			{ id: "otherwise", name: "Default" },
		]);
		expect(outputs[0]!.id).toBe(before[0]);
		expect(outputs[1]!.id).toBe(before[1]);
		expect(outputs[3]!.id).toBe(before[2]);
		expect(workflow.connections.some(c => c.source === id && c.sourceHandle === wired.handle)).toBe(true);
	});

	it("drops the outputs past the last rule — and the wires leaving them", () => {
		let { workflow, id } = withSwitch();
		workflow = wire(workflow, id, "case_2").workflow;
		const wires = workflow.connections.length;
		workflow = setRules(workflow, id, [rule("a", "a")]);
		expect(node(workflow, id).outputs.map(o => o.base.id)).toEqual(["case_1", "otherwise"]);
		expect(workflow.connections.length).toBe(wires - 1);
	});

	it("sends the rules as one object, each rule's output on its wire id", () => {
		let { workflow, id } = withSwitch();
		workflow = setRules(workflow, id, [rule("{{ mode }}", "auto")]);
		const payload = new GenerateExecuteCommand().execute(workflow, id)!;
		const view = new DataView(payload.buffer);
		let index = 6 + payload[5]! * 4;
		let sent: unknown;
		while (index < payload.length) {
			const dataType = payload[index + 3]!;
			const sized = isSizedDataType(dataType);
			const size = sized ? view.getUint16(index + 4, true) : dataType === DataType.BOOL ? 1 : 4;
			const start = index + 4 + (sized ? 2 : 0);
			if (view.getUint16(index, true) === generateId("switch/routing rules")) {
				expect(dataType).toBe(DataType.OBJECT);
				sent = JSON.parse(new TextDecoder().decode(payload.slice(start, start + size)));
			}
			index = start + size;
		}
		// Without the studio's ids: a value is at most MAX_DATA_BUFFER bytes.
		expect(sent).toEqual({ values: [{ conditions: { combinator: "and", conditions: [{ leftValue: "{{ mode }}", operator: "string:equals", rightValue: "auto" }] }, outputKey: "" }] });
		const action = node(workflow, id);
		expect(computeWireOutputId(action, "case_1")).toBe(generateId("case_1"));
	});

	it("leaves the outputs as they are while the rules are bound to a script", () => {
		const { workflow, id } = withSwitch();
		const bound = {
			...workflow,
			components: workflow.components.map(c => ({ ...c, actions: c.actions.map(a => a.id !== id ? a : { ...a, configurations: a.configurations.map(cfg => ({ ...cfg, binding: { code: "return {}" } })) }) })),
		};
		const other = new UpdateWorkflowActionConfiguration().execute(bound, LOGIC_COMPONENT_ID, id, "nope", "x");
		expect(node(other, id).outputs.map(o => o.base.id)).toEqual(["case_1", "case_2", "otherwise"]);
	});

});
