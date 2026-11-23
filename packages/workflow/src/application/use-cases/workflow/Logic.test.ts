import { describe, expect, it } from "vitest";
import { DataType, isSizedDataType } from "../../../domain/wire/DataType.js";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { ComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { isLogicComponent, LOGIC_COMPONENT_ID, LogicComponentSchema, withLogicComponent } from "../../../domain/value-objects/LogicComponent.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent, findAddableComponent } from "./AddActionToComponent.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";
import { UpdateWorkflowActionConfiguration } from "./UpdateActionConfiguration.use-case.js";
import { SetWorkflowActionConfigurationCode } from "./SetActionConfigurationCode.use-case.js";
import { getActionOutputs } from "./ResolveNextAction.use-case.js";
import { computeWireInstanceId } from "./ResolveWorkflowAction.js";
import { generateId } from "../../../utils/identifier.js";

const LedSchema: IComponentSchema = {
	displayName: "Led",
	description: "",
	actions: [{ displayName: "Write", description: "", script: "write.py" }],
};

const baseWorkflow = (): IWorkflowRuntime =>
	new CreateWorkflow().execute("wf", "", { name: "esp32", displayName: "ESP32", description: "", pins: [] } as never, "board-pkg");

const actionSchema = (name: string) => LogicComponentSchema.actions!.find(action => action.displayName === name)!;

const addLogic = (workflow: IWorkflowRuntime, name: string) => {
	const result = new AddActionToWorkflowComponent().execute(workflow, LOGIC_COMPONENT_ID, actionSchema(name));
	return { workflow: result.workflow, action: result.action! };
};

/** The OUTPUTS section of an EXECUTE body: {OUTPUT_ID, TARGET_INSTANCE_ID} pairs. */
const outputEntries = (payload: Uint8Array) => {
	const view = new DataView(payload.buffer);
	return Array.from({ length: payload[5]! }, (_, i) => ({
		outputId: view.getUint16(6 + i * 4, true),
		target: view.getUint16(8 + i * 4, true),
	}));
};

/** The CONFIG_IDs of an EXECUTE body's entries — LITERALs only, which is all these frames carry. */
const literalConfigIds = (payload: Uint8Array) => {
	const view = new DataView(payload.buffer);
	const ids: number[] = [];
	let index = 6 + payload[5]! * 4;
	while (index < payload.length) {
		ids.push(view.getUint16(index, true));
		const dataType = payload[index + 3]!;
		const sized = isSizedDataType(dataType);
		const size = sized ? view.getUint16(index + 4, true) : dataType === DataType.BOOL ? 1 : 4;
		index += 4 + (sized ? 2 : 0) + size;
	}
	return ids;
};

describe("the built-in Logic component", () => {

	it("is a valid component schema", () => {
		expect(ComponentSchema.safeParse(LogicComponentSchema).success).toBe(true);
	});

	it("is offered before it's in the workflow, and added once, with the first action", () => {
		const workflow = baseWorkflow();
		expect(workflow.components.some(isLogicComponent)).toBe(false);
		expect(findAddableComponent(workflow, LOGIC_COMPONENT_ID)?.base.displayName).toBe("Logic");

		const first = addLogic(workflow, "If");
		const second = addLogic(first.workflow, "Switch");
		const logic = second.workflow.components.filter(isLogicComponent);
		expect(logic).toHaveLength(1);
		expect(logic[0]!.actions.map(action => action.base.displayName)).toEqual(["If", "Switch"]);
		expect(withLogicComponent(second.workflow)).toBe(second.workflow);
	});

	it("compiles If to the ids the platform handles: logic/if, its configs, True and False", () => {
		let { workflow, action: ifAction } = addLogic(baseWorkflow(), "If");

		// True → one Led write, False → another.
		const led = new AddComponentToWorkflow().execute(workflow, LedSchema, "led-pkg");
		workflow = led.workflow;
		const writes = [0, 1].map(() => {
			const added = new AddActionToWorkflowComponent().execute(workflow, led.component.id, LedSchema.actions![0]!);
			workflow = added.workflow;
			return added.action!;
		});
		const [trueOut, falseOut] = getActionOutputs(ifAction);
		expect([trueOut!.base.id, falseOut!.base.id]).toEqual(["true", "false"]);
		workflow = {
			...workflow,
			connections: [trueOut!, falseOut!].map((output, i) => ({
				id: `c${i}`,
				source: ifAction.id,
				sourceHandle: output.id,
				target: writes[i]!.id,
				targetHandle: writes[i]!.inputs[0]!.id,
			})),
		};

		const payload = new GenerateExecuteCommand().execute(workflow, ifAction.id)!;
		expect(new DataView(payload.buffer).getUint16(1, true)).toBe(generateId("logic/if"));
		expect(outputEntries(payload)).toEqual([
			{ outputId: generateId("true"), target: computeWireInstanceId(writes[0]!) },
			{ outputId: generateId("false"), target: computeWireInstanceId(writes[1]!) },
		]);
		// Its Conditions — a filter, one config: what the board evaluates.
		expect(literalConfigIds(payload)).toEqual(expect.arrayContaining([generateId("if/conditions")]));
	});

	it("fits Switch's outputs in what a board takes, and names Repeat's", () => {
		const { action: switchAction } = addLogic(baseWorkflow(), "Switch");
		const real = getActionOutputs(switchAction).filter(output => output.base.id !== "fallback");
		expect(real.map(output => output.base.id)).toEqual(["case_1", "case_2", "otherwise"]);

		const { workflow, action: repeat } = addLogic(baseWorkflow(), "Repeat");
		const payload = new GenerateExecuteCommand().execute(workflow, repeat.id)!;
		expect(new DataView(payload.buffer).getUint16(1, true)).toBe(generateId("logic/repeat"));
		// Times, and Pass Context's flag — Logic hands on the data around it by default.
		expect(literalConfigIds(payload)).toEqual([generateId("repeat/times"), generateId("context/pass")]);
	});

	it("takes If's Conditions from a script — an object (the filter) it returns", () => {
		const { workflow, action: ifAction } = addLogic(baseWorkflow(), "If");
		const conditions = ifAction.configurations.find(c => c.base.displayName === "Conditions")!;
		const coded = new SetWorkflowActionConfigurationCode().execute(workflow, LOGIC_COMPONENT_ID, ifAction.id, conditions.id, 'return {"conditions": []}');
		const payload = new GenerateExecuteCommand().execute(coded, ifAction.id)!;
		// The CODE entry: CONFIG_ID(16) VALUE_TYPE CODE(0x02) RESULT_TYPE.
		const id = generateId("if/conditions");
		const at = payload.findIndex((_, i) => payload[i] === (id & 0xff) && payload[i + 1] === id >> 8 && payload[i + 2] === 0x02);
		expect(at).toBeGreaterThan(0);
		expect(payload[at + 3]).toBe(DataType.OBJECT);
	});

});
