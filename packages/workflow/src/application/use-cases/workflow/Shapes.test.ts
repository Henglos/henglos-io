import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { ComponentSchema, type IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { ComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";
import type { IShape } from "../../../domain/schemas/ISchema.schema.js";
import { emptyShapeValue, isShapeCompatible, shapeLabel, validateShape } from "../../../domain/value-objects/ShapeValue.js";
import { VARIABLES_PACKAGE_ID, VariablesComponentSchema } from "../../../domain/value-objects/VariablesComponent.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { UpdateWorkflowActionConfiguration } from "./UpdateActionConfiguration.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";
import { AddWorkflowVariable } from "./AddWorkflowVariable.use-case.js";
import { UpdateWorkflowVariable } from "./UpdateWorkflowVariable.use-case.js";
import { computeWireVariableId } from "./WorkflowVariables.js";
import { generateId } from "../../../utils/identifier.js";
import { DataType, isSizedDataType } from "../../../domain/wire/DataType.js";

const NETWORKS: IShape = { list: { object: { ssid: "string", rssi: "integer", channel: "integer" } } };

const baseWorkflow = (): IWorkflowRuntime =>
	new CreateWorkflow().execute("wf", "", { name: "esp32", description: "", pins: [] } as never, "board-pkg");

// The literal entry of a config in an EXECUTE: [DATA TYPE byte, its data].
const literal = (payload: Uint8Array, configId: number): [number, Uint8Array] => {
	const view = new DataView(payload.buffer, payload.byteOffset);
	let at = 6 + payload[5]! * 4;
	for (let i = 0; i < payload[4]!; i++) {
		const id = view.getUint16(at, true);
		const type = payload[at + 3]!;
		const sized = isSizedDataType(type);
		const size = sized ? view.getUint16(at + 4, true) : type === DataType.BOOL ? 1 : 4;
		const start = at + 4 + (sized ? 2 : 0);
		if (id === configId) return [type, payload.slice(start, start + size)];
		at = start + size;
	}
	throw new Error("config not in the payload");
};

describe("shapes", () => {

	it("validates values against a shape, saying where it doesn't fit", () => {
		expect(validateShape(NETWORKS, [{ ssid: "Home", rssi: -55, channel: 6 }])).toBeNull();
		expect(validateShape(NETWORKS, [{ ssid: "Home", rssi: -55.5, channel: 6 }])).toBe("[0].rssi: expected an integer");
		expect(validateShape(NETWORKS, [{ ssid: "Home", rssi: -55 }])).toBe("[0]: missing \"channel\"");
		expect(validateShape(NETWORKS, [{ ssid: "x", rssi: 2 ** 31, channel: 300 }])).toMatch(/\[0\]\.rssi: out of an integer's range/);
		expect(validateShape(NETWORKS, { ssid: "x" })).toBe("value: expected a list");
		expect(validateShape({ list: "bool" }, [true, 1])).toBe("[1]: expected true or false");
	});

	it("tells which output shapes can feed which configs", () => {
		expect(isShapeCompatible(NETWORKS, { list: { object: { ssid: "string" } } })).toBe(true);      // extra fields are fine
		expect(isShapeCompatible({ list: "integer" }, { list: "float" })).toBe(true);              // any number for any number
		expect(isShapeCompatible({ list: "integer" }, { list: "string" })).toBe(false);
		expect(isShapeCompatible({ object: { a: "string" } }, { object: { a: "string", b: "integer" } })).toBe(false);
		expect(isShapeCompatible("float", { list: "float" })).toBe(false);
		expect(isShapeCompatible("any", NETWORKS)).toBe(true);
		expect(shapeLabel(NETWORKS)).toBe("list of { ssid: string, rssi: integer, channel: integer }");
		expect(emptyShapeValue({ object: { x: "float", tags: { list: "string" }, on: "bool", name: "string" } })).toEqual({ x: 0, tags: [], on: false, name: "" });
	});

	it("a manifest's outputSchema and configs take shapes", () => {
		const schema: IComponentSchema = {
			displayName: "WiFi", description: "",
			actions: [{
				displayName: "Scan", description: "", script: "src/scan.py",
				outputSchema: [{ name: "networks", type: NETWORKS }],
				configurations: [
					{ displayName: "Points", description: "", type: "list", items: { object: { x: "float", y: "float" } }, maxItems: 10 },
					{ displayName: "Limits", description: "", type: "object", fields: [{ name: "low", displayName: "Low", type: "float" }, { name: "high", displayName: "High", type: "float" }] },
				],
			}],
		};
		expect(ComponentSchema.safeParse(schema).success).toBe(true);
		expect(ComponentSchema.safeParse({ ...schema, actions: [{ ...schema.actions![0]!, outputSchema: [{ name: "bad", type: { list: "nope" } }] }] }).success).toBe(false);
	});

	it("sends a list config as its JSON (DataType LIST) — checked against its shape and Max Items", () => {
		const Chart: IComponentSchema = {
			displayName: "Chart", description: "",
			actions: [{ displayName: "Plot", description: "", script: "plot.py", configurations: [
				{ displayName: "Points", description: "", type: "list", items: { object: { x: "float", y: "float" } }, maxItems: 2 },
			] }],
		};
		const added = new AddComponentToWorkflow().execute(baseWorkflow(), Chart, "chart-pkg");
		let workflow = new AddActionToWorkflowComponent().execute(added.workflow, added.component.id, Chart.actions![0]!).workflow;
		const plot = workflow.components.find(c => c.id === added.component.id)!.actions[0]!;
		const set = (value: unknown) => new UpdateWorkflowActionConfiguration().execute(workflow, added.component.id, plot.id, plot.configurations[0]!.id, value as never);

		workflow = set([{ x: 1, y: 2 }, { x: 3, y: 4.5 }]);
		const [type, data] = literal(new GenerateExecuteCommand().execute(workflow, plot.id)!, generateId("plot/points"));
		expect(type).toBe(DataType.LIST);
		expect(JSON.parse(new TextDecoder().decode(data))).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4.5 }]);

		workflow = set([{ x: 1 }]);
		expect(() => new GenerateExecuteCommand().execute(workflow, plot.id)).toThrow(/\[0\]: missing "y"/);
		workflow = set([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
		expect(() => new GenerateExecuteCommand().execute(workflow, plot.id)).toThrow(/3 itens — o máximo é 2/);
	});

	it("list and object variables: a shape, an initial value that fits it, sent as JSON", () => {
		const add = new AddWorkflowVariable();
		const history = { list: "float" } as const;
		expect(add.execute(baseWorkflow(), { name: "h", type: "list", initial: [1, 2], shape: { object: { a: "string" } } }).variable).toBeUndefined();   // wrong kind of shape
		expect(add.execute(baseWorkflow(), { name: "h", type: "list", initial: ["x"], shape: history }).variable).toBeUndefined();                       // doesn't fit
		expect(add.execute(baseWorkflow(), { name: "h", type: "string", initial: "x", shape: history }).variable).toBeUndefined();                          // a simple type has no shape

		let { workflow } = add.execute(baseWorkflow(), { name: "history", type: "list", initial: [1.5, 2], shape: history });
		const [type, data] = literal(new GenerateExecuteCommand().execute(workflow, workflow.start.id)!, computeWireVariableId("history"));
		expect(type).toBe(DataType.LIST);
		expect(JSON.parse(new TextDecoder().decode(data))).toEqual([1.5, 2]);

		// A type change drops the shape — and an initial value that no longer fits.
		const id = workflow.variables![0]!.id;
		workflow = new UpdateWorkflowVariable().execute(workflow, id, { type: "integer" });
		expect(workflow.variables![0]).toEqual({ id, name: "history", type: "integer", initial: null });
	});

	it("dynamic list and object variables accept any json value and structure", () => {
		const add = new AddWorkflowVariable();
		const listVar = add.execute(baseWorkflow(), {
			name: "items",
			type: "list",
			initial: [1, "mixed", true, { k: "v" }, [2]],
			shape: { list: "any" },
		});
		expect(listVar.variable).toBeDefined();
		expect(listVar.variable?.initial).toEqual([1, "mixed", true, { k: "v" }, [2]]);

		const objVar = add.execute(baseWorkflow(), {
			name: "config",
			type: "object",
			initial: { dynamicField: "value", count: 42, active: true, nested: [1, 2] },
			shape: { object: {} },
		});
		expect(objVar.variable).toBeDefined();
		expect(objVar.variable?.initial).toEqual({ dynamicField: "value", count: 42, active: true, nested: [1, 2] });
	});

	it("built-ins are read with today's schema — a Variables saved before Append has it", () => {
		const old = { id: "c", packageId: VARIABLES_PACKAGE_ID, alias: "Variables", base: { ...VariablesComponentSchema, actions: VariablesComponentSchema.actions!.slice(0, 1) }, actions: [] };
		expect(ComponentRuntime.parse(old).base.actions!.map(action => action.displayName)).toEqual(["Set", "Append", "Set Field", "Clear", "Remove"]);
	});

});
