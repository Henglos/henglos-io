import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { isVariablesComponent } from "../../../domain/value-objects/VariablesComponent.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { UpdateWorkflowActionConfiguration } from "./UpdateActionConfiguration.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";
import { AddWorkflowVariable } from "./AddWorkflowVariable.use-case.js";
import { BindWorkflowActionConfigurationVariable } from "./BindWorkflowActionConfigurationVariable.use-case.js";
import { RemoveWorkflowVariable } from "./RemoveWorkflowVariable.use-case.js";
import { UpdateWorkflowVariable } from "./UpdateWorkflowVariable.use-case.js";
import { computeWireVariableId, validateVariableName } from "./WorkflowVariables.js";
import { generateId } from "../../../utils/identifier.js";
import { readWorkflowDoc, reconcileWorkflowDoc } from "../../../collab/WorkflowDoc.js";
import { VariableRuntime } from "../../../domain/entities/IVariable.runtime.js";
import { DataType, isSizedDataType } from "../../../domain/wire/DataType.js";
import { SetPlatformSetting } from "./SetPlatformSetting.use-case.js";

const LedSchema: IComponentSchema = {
	displayName: "Led",
	description: "",
	actions: [{
		displayName: "Write",
		description: "",
		script: "write.py",
		configurations: [{ displayName: "Level", description: "", type: "toggle", defaultValue: false }],
	}],
};

const baseWorkflow = (): IWorkflowRuntime =>
	new CreateWorkflow().execute("wf", "", { name: "esp32", displayName: "ESP32", description: "", pins: [] } as never, "board-pkg");

/** The EXECUTE body's config entries, decoded just enough to assert on (see ActionBody.py). */
const configEntries = (payload: Uint8Array) => {
	const view = new DataView(payload.buffer);
	const entries: { configId: number; valueType: number; word?: number; dataType?: number; expectedType?: number }[] = [];
	let index = 6 + payload[5]! * 4;
	while (index < payload.length) {
		const configId = view.getUint16(index, true);
		const valueType = payload[index + 2]!;
		index += 3;
		if (valueType === 0x01 || valueType === 0x04) {
			entries.push({ configId, valueType, word: view.getUint16(index, true), expectedType: payload[index + 2] });
			index += 3;
		} else if (valueType === 0x00) {
			const dataType = payload[index]!;
			const sized = isSizedDataType(dataType);
			const size = sized ? view.getUint16(index + 1, true) : dataType === DataType.BOOL ? 1 : 4;
			const dataStart = index + 1 + (sized ? 2 : 0);
			entries.push({ configId, valueType, dataType, word: size === 4 ? view.getInt32(dataStart, true) : payload[dataStart] });
			index = dataStart + size;
		} else {
			throw new Error(`unexpected value type ${valueType}`);
		}
	}
	return entries;
};

describe("workflow variables", () => {

	it("validates names: identifiers, unique case-insensitively", () => {
		const { workflow } = new AddWorkflowVariable().execute(baseWorkflow(), { name: "count", type: "integer", initial: null });
		expect(validateVariableName(workflow, "1abc")).not.toBeNull();
		expect(validateVariableName(workflow, "with space")).not.toBeNull();
		expect(validateVariableName(workflow, "COUNT")).toMatch(/already/);
		expect(validateVariableName(workflow, "total")).toBeNull();
		// Renaming a variable to its own name is fine.
		expect(validateVariableName(workflow, "Count", workflow.variables![0]!.id)).toBeNull();
	});

	it("adds the built-in Variables component once, with the variable", () => {
		const add = new AddWorkflowVariable();
		const first = add.execute(baseWorkflow(), { name: "a", type: "float", initial: null }).workflow;
		const second = add.execute(first, { name: "b", type: "integer", initial: 3 }).workflow;

		expect(second.components.filter(isVariablesComponent)).toHaveLength(1);
		expect(second.variables!.map(v => v.name)).toEqual(["a", "b"]);
		// A rejected name changes nothing.
		expect(add.execute(second, { name: "A", type: "float", initial: null }).workflow).toBe(second);
	});

	it("renames, re-initializes and removes", () => {
		let workflow = new AddWorkflowVariable().execute(baseWorkflow(), { name: "a", type: "float", initial: null }).workflow;
		const id = workflow.variables![0]!.id;

		workflow = new UpdateWorkflowVariable().execute(workflow, id, { name: "speed", type: "float", initial: 1.5 });
		expect(workflow.variables![0]).toMatchObject({ name: "speed", type: "float", initial: 1.5 });

		workflow = new RemoveWorkflowVariable().execute(workflow, id);
		expect(workflow.variables).toEqual([]);
	});

	it("compiles Set, VARIABLE bindings and Start's initial values", () => {

		let workflow = baseWorkflow();
		const added = new AddWorkflowVariable().execute(workflow, { name: "Level", type: "bool", initial: true });
		workflow = added.workflow;
		const variable = added.variable!;
		const variables = workflow.components.find(isVariablesComponent)!;

		// Variables / Set → writes "Level"
		workflow = new AddActionToWorkflowComponent().execute(workflow, variables.id, variables.base.actions![0]!).workflow;
		const set = workflow.components.find(isVariablesComponent)!.actions[0]!;
		const target = set.configurations.find(c => c.base.type === "variable")!;
		workflow = new UpdateWorkflowActionConfiguration().execute(workflow, variables.id, set.id, target.id, variable.id);

		// Led / Write's "Level" reads the variable
		const withLed = new AddComponentToWorkflow().execute(workflow, LedSchema, "led-pkg");
		workflow = new AddActionToWorkflowComponent().execute(withLed.workflow, withLed.component.id, LedSchema.actions![0]!).workflow;
		const write = workflow.components.find(c => c.id === withLed.component.id)!.actions[0]!;
		workflow = new BindWorkflowActionConfigurationVariable().execute(workflow, withLed.component.id, write.id, write.configurations[0]!.id, variable.id);

		const generate = new GenerateExecuteCommand();
		const variableId = computeWireVariableId("level");

		// ACTION_ID of the platform's built-in Set (builtin/variables).
		const setPayload = generate.execute(workflow, set.id)!;
		expect(new DataView(setPayload.buffer).getUint16(1, true)).toBe(generateId("variables/set"));
		expect(configEntries(setPayload)).toContainEqual({ configId: generateId("set/variable"), valueType: 0x00, dataType: DataType.INTEGER, word: variableId });

		const writeEntries = configEntries(generate.execute(workflow, write.id)!);
		// A toggle: the board gets the variable as a BOOL, converting it if it must.
		expect(writeEntries).toEqual([{ configId: generateId("write/level"), valueType: 0x04, word: variableId, expectedType: DataType.BOOL }]);

		const startEntries = configEntries(generate.execute(workflow, workflow.start.id)!);
		expect(startEntries).toContainEqual({ configId: variableId, valueType: 0x00, dataType: DataType.BOOL, word: 1 });

		// Removing the variable drops whatever pointed at it instead of sending a dead id.
		workflow = new RemoveWorkflowVariable().execute(workflow, variable.id);
		expect(configEntries(generate.execute(workflow, write.id)!)).toEqual([]);
		expect(configEntries(generate.execute(workflow, set.id)!).map(e => e.configId)).not.toContain(generateId("set/variable"));
	});

	it("sends Set's Value as any value type — a string, a list, an object — not only a number or a bool", () => {

		let workflow = new AddWorkflowVariable().execute(baseWorkflow(), { name: "greeting", type: "string", initial: null }).workflow;
		const variables = workflow.components.find(isVariablesComponent)!;
		workflow = new AddActionToWorkflowComponent().execute(workflow, variables.id, variables.base.actions![0]!).workflow;
		const set = workflow.components.find(isVariablesComponent)!.actions[0]!;
		const valueConfig = set.configurations.find(c => c.base.displayName === "Value")!;
		expect(valueConfig.base.type === "any" && valueConfig.base.availables).toEqual(["integer", "float", "bool", "string", "list", "object"]);

		// The Value literal: its DATA_TYPE and its bytes.
		const sent = (value: unknown) => {
			const typed = new UpdateWorkflowActionConfiguration().execute(workflow, variables.id, set.id, valueConfig.id, value as never);
			const payload = new GenerateExecuteCommand().execute(typed, set.id)!;
			const view = new DataView(payload.buffer);
			let index = 6 + payload[5]! * 4;
			while (index < payload.length) {
				const configId = view.getUint16(index, true);
				const dataType = payload[index + 3]!;
				const sized = isSizedDataType(dataType);
				const size = sized ? view.getUint16(index + 4, true) : dataType === DataType.BOOL ? 1 : 4;
				const start = index + 4 + (sized ? 2 : 0);
				if (configId === generateId("set/value")) return { dataType, text: new TextDecoder().decode(payload.slice(start, start + size)) };
				index = start + size;
			}
			return undefined;
		};

		expect(sent({ kind: "string", value: "oi" })).toEqual({ dataType: DataType.STRING, text: "oi" });
		expect(sent({ kind: "list", value: [1, "a"] })).toEqual({ dataType: DataType.LIST, text: '[1,"a"]' });
		expect(sent({ kind: "object", value: { t: 21.5 } })).toEqual({ dataType: DataType.OBJECT, text: '{"t":21.5}' });
	});

	it("takes an any value only when it is of its kind", async () => {
		const { AnyValueSchema } = await import("../../../domain/entities/IConfiguration.schema.js");
		expect(AnyValueSchema.safeParse({ kind: "string", value: "x" }).success).toBe(true);
		expect(AnyValueSchema.safeParse({ kind: "list", value: [1] }).success).toBe(true);
		expect(AnyValueSchema.safeParse({ kind: "object", value: { a: 1 } }).success).toBe(true);
		expect(AnyValueSchema.safeParse({ kind: "integer", value: 1.5 }).success).toBe(false);
		expect(AnyValueSchema.safeParse({ kind: "string", value: 1 }).success).toBe(false);
		expect(AnyValueSchema.safeParse({ kind: "list", value: { a: 1 } }).success).toBe(false);
		expect(AnyValueSchema.safeParse({ kind: "object", value: [1] }).success).toBe(false);
	});

	it("round-trips through the collab doc, and leaves older workflows without the map", () => {
		const workflow = new AddWorkflowVariable().execute(baseWorkflow(), { name: "a", type: "integer", initial: 7 }).workflow;

		const doc = new Y.Doc();
		reconcileWorkflowDoc(doc, workflow);
		expect(readWorkflowDoc(doc).variables).toEqual(workflow.variables);

		const legacy = new Y.Doc();
		reconcileWorkflowDoc(legacy, baseWorkflow());
		expect("variables" in readWorkflowDoc(legacy)).toBe(false);
	});

	it("checks the initial value against the type, and drops it when a type change makes it invalid", () => {
		const add = new AddWorkflowVariable();
		expect(add.execute(baseWorkflow(), { name: "x", type: "integer", initial: 1.5 }).variable).toBeUndefined();
		expect(add.execute(baseWorkflow(), { name: "x", type: "bool", initial: 1 }).variable).toBeUndefined();
		expect(add.execute(baseWorkflow(), { name: "x", type: "string", initial: "a".repeat(513) }).variable).toBeUndefined();

		let workflow = add.execute(baseWorkflow(), { name: "x", type: "integer", initial: 4 }).workflow;
		const id = workflow.variables![0]!.id;
		workflow = new UpdateWorkflowVariable().execute(workflow, id, { type: "float" });
		expect(workflow.variables![0]).toMatchObject({ type: "float", initial: 4 });
		workflow = new UpdateWorkflowVariable().execute(workflow, id, { type: "bool" });
		expect(workflow.variables![0]).toMatchObject({ type: "bool", initial: null });
	});

	it("sends a string variable's initial value as a STRING", () => {
		const workflow = new AddWorkflowVariable().execute(baseWorkflow(), { name: "greeting", type: "string", initial: "oi" }).workflow;
		const payload = new GenerateExecuteCommand().execute(workflow, workflow.start.id)!;
		const hex = Array.from(payload).map(b => b.toString(16).padStart(2, "0")).join("");
		const id = computeWireVariableId("greeting");
		// CONFIG_ID(16 LE) + LITERAL + STRING + SIZE(16 LE)=2 + "oi"
		expect(hex).toContain(`${(id & 0xff).toString(16).padStart(2, "0")}${(id >> 8).toString(16).padStart(2, "0")}0003` + "0200" + "6f69");
	});

	it("bounds a string by the workflow's MAX_DATA_BUFFER, not a fixed size", () => {
		const add = new AddWorkflowVariable();
		const text = "x".repeat(600);
		expect(add.execute(baseWorkflow(), { name: "msg", type: "string", initial: text }).variable).toBeUndefined();

		const raised = new SetPlatformSetting().execute(baseWorkflow(), "MAX_DATA_BUFFER", 700);
		const { workflow, variable } = add.execute(raised, { name: "msg", type: "string", initial: text });
		expect(variable?.initial).toBe(text);
		// The stored shape is still valid for the schema (the hosting re-parses it).
		expect(VariableRuntime.safeParse(variable).success).toBe(true);

		// Lowering the limit afterwards: the build refuses instead of sending what the board would drop.
		const lowered = new SetPlatformSetting().execute(workflow, "MAX_DATA_BUFFER", null);
		expect(() => new GenerateExecuteCommand().execute(lowered, lowered.start.id)).toThrow(/valor inicial da variável "msg" tem 600 bytes — o máximo que a placa aceita é 512/);
	});
});

