import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { ComponentSchema, type IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { ComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";
import { withPythonKinds, type IShape } from "../../../domain/schemas/IKSchema.schema.js";
import { emptyShapeValue, isShapeCompatible, shapeLabel, validateShape } from "../../../domain/value-objects/ShapeValue.js";
import { VARIABLES_PACKAGE_ID, VariablesComponentSchema } from "../../../domain/value-objects/VariablesComponent.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { UpdateWorkflowActionConfiguration } from "./UpdateActionConfiguration.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";
import { AddWorkflowVariable, computeWireVariableId, UpdateWorkflowVariable } from "./Variables.use-case.js";
import { generateId } from "../../../utils/identifier.js";

const NETWORKS: IShape = { array: { object: { ssid: "str", rssi: "int", channel: "int" } } };

const baseWorkflow = (): IWorkflowRuntime =>
	new CreateWorkflow().execute("wf", "", { name: "esp32", description: "", pins: [] } as never, "board-pkg");

// The literal entry of a config in an EXECUTE: [DATA TYPE byte, its data].
const literal = (payload: Uint8Array, configId: number): [number, Uint8Array] => {
	const view = new DataView(payload.buffer, payload.byteOffset);
	let at = 6 + payload[5]! * 4;
	for (let i = 0; i < payload[4]!; i++) {
		const id = view.getUint16(at, true);
		const type = payload[at + 3]!;
		const size = type & 0x80 ? view.getUint16(at + 4, true) : 0;
		const start = at + 4 + (type & 0x80 ? 2 : 0);
		if (id === configId) return [type, payload.slice(start, start + size)];
		at = start + size;
	}
	throw new Error("config not in the payload");
};

describe("shapes", () => {

	it("validates values against a shape, saying where it doesn't fit", () => {
		expect(validateShape(NETWORKS, [{ ssid: "Home", rssi: -55, channel: 6 }])).toBeNull();
		expect(validateShape(NETWORKS, [{ ssid: "Home", rssi: -55.5, channel: 6 }])).toBe("[0].rssi: expected a whole number");
		expect(validateShape(NETWORKS, [{ ssid: "Home", rssi: -55 }])).toBe("[0]: missing \"channel\"");
		expect(validateShape(NETWORKS, [{ ssid: "x", rssi: 2 ** 31, channel: 300 }])).toMatch(/\[0\]\.rssi: out of int's range/);
		expect(validateShape(NETWORKS, { ssid: "x" })).toBe("value: expected a list");
		expect(validateShape({ array: "bool" }, [true, 1])).toBe("[1]: expected true or false");
	});

	it("tells which output shapes can feed which configs", () => {
		expect(isShapeCompatible(NETWORKS, { array: { object: { ssid: "str" } } })).toBe(true);      // extra fields are fine
		expect(isShapeCompatible({ array: "int" }, { array: "float" })).toBe(true);              // any number for any number
		expect(isShapeCompatible({ array: "int" }, { array: "str" })).toBe(false);
		expect(isShapeCompatible({ object: { a: "str" } }, { object: { a: "str", b: "int" } })).toBe(false);
		expect(isShapeCompatible("float", { array: "float" })).toBe(false);
		expect(isShapeCompatible("any", NETWORKS)).toBe(true);
		expect(shapeLabel(NETWORKS)).toBe("list of { ssid: str, rssi: int, channel: int }");
		expect(emptyShapeValue({ object: { x: "float", tags: { array: "str" }, on: "bool", name: "str" } })).toEqual({ x: 0, tags: [], on: false, name: "" });
	});

	it("reads the old width-specific names as MicroPython's", () => {
		const old = { array: { object: { ssid: "text", rssi: "int32", channel: "uint8", level: "float32" } } } as unknown as IShape;
		expect(shapeLabel(old)).toBe("list of { ssid: str, rssi: int, channel: int, level: float }");
		expect(validateShape(old, [{ ssid: "x", rssi: -1, channel: 300, level: 0.5 }])).toBeNull();
		expect(isShapeCompatible(old, NETWORKS)).toBe(true);
		expect(withPythonKinds({ type: { array: "uint16" }, kinds: ["int8", "float16", "bool"], kind: "int32" }))
			.toEqual({ type: { array: "int" }, kinds: ["int", "float", "bool"], kind: "int" });
		// A variable's type "text" stays — it isn't a shape.
		expect(withPythonKinds({ type: "text" })).toEqual({ type: "text" });
		expect(ComponentSchema.safeParse({ displayName: "X", description: "", actions: [{ displayName: "A", description: "", script: "a.py", configurations: [], outputSchema: [{ name: "n", type: "uint8" }, { name: "s", type: "text" }] }] }).data?.actions?.[0]?.outputSchema)
			.toEqual([{ name: "n", type: "int" }, { name: "s", type: "str" }]);
	});

	it("a manifest's outputSchema and configs take shapes", () => {
		const schema: IComponentSchema = {
			displayName: "WiFi", description: "",
			actions: [{
				displayName: "Scan", description: "", script: "src/scan.py",
				outputSchema: [{ name: "networks", type: NETWORKS }],
				configurations: [
					{ displayName: "Points", description: "", type: "array", items: { object: { x: "float", y: "float" } }, maxItems: 10 },
					{ displayName: "Limits", description: "", type: "object", fields: [{ name: "low", displayName: "Low", type: "float" }, { name: "high", displayName: "High", type: "float" }] },
				],
			}],
		};
		expect(ComponentSchema.safeParse(schema).success).toBe(true);
		expect(ComponentSchema.safeParse({ ...schema, actions: [{ ...schema.actions![0]!, outputSchema: [{ name: "bad", type: { array: "nope" } }] }] }).success).toBe(false);
	});

	it("sends a list config as its JSON (DataType 13, array) — checked against its shape and Max Items", () => {
		const Chart: IComponentSchema = {
			displayName: "Chart", description: "",
			actions: [{ displayName: "Plot", description: "", script: "plot.py", configurations: [
				{ displayName: "Points", description: "", type: "array", items: { object: { x: "float", y: "float" } }, maxItems: 2 },
			] }],
		};
		const added = new AddComponentToWorkflow().execute(baseWorkflow(), Chart, "chart-pkg");
		let workflow = new AddActionToWorkflowComponent().execute(added.workflow, added.component.id, Chart.actions![0]!).workflow;
		const plot = workflow.components.find(c => c.id === added.component.id)!.actions[0]!;
		const set = (value: unknown) => new UpdateWorkflowActionConfiguration().execute(workflow, added.component.id, plot.id, plot.configurations[0]!.id, value as never);

		workflow = set([{ x: 1, y: 2 }, { x: 3, y: 4.5 }]);
		const [type, data] = literal(new GenerateExecuteCommand().execute(workflow, plot.id)!, generateId("plot/points"));
		expect(type).toBe(13 | 0x80);
		expect(JSON.parse(new TextDecoder().decode(data))).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4.5 }]);

		workflow = set([{ x: 1 }]);
		expect(() => new GenerateExecuteCommand().execute(workflow, plot.id)).toThrow(/\[0\]: missing "y"/);
		workflow = set([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
		expect(() => new GenerateExecuteCommand().execute(workflow, plot.id)).toThrow(/3 itens — o máximo é 2/);
	});

	it("list and object variables: a shape, an initial value that fits it, sent as JSON", () => {
		const add = new AddWorkflowVariable();
		const history = { array: "float" } as const;
		expect(add.execute(baseWorkflow(), { name: "h", type: "array", initial: [1, 2], shape: { object: { a: "str" } } }).variable).toBeUndefined();   // wrong kind of shape
		expect(add.execute(baseWorkflow(), { name: "h", type: "array", initial: ["x"], shape: history }).variable).toBeUndefined();                       // doesn't fit
		expect(add.execute(baseWorkflow(), { name: "h", type: "text", initial: "x", shape: history }).variable).toBeUndefined();                          // a simple type has no shape

		let { workflow } = add.execute(baseWorkflow(), { name: "history", type: "array", initial: [1.5, 2], shape: history });
		const [type, data] = literal(new GenerateExecuteCommand().execute(workflow, workflow.start.id)!, computeWireVariableId("history"));
		expect(type).toBe(13 | 0x80);
		expect(JSON.parse(new TextDecoder().decode(data))).toEqual([1.5, 2]);

		// A type change drops the shape — and an initial value that no longer fits.
		const id = workflow.variables![0]!.id;
		workflow = new UpdateWorkflowVariable().execute(workflow, id, { type: "integer" });
		expect(workflow.variables![0]).toEqual({ id, name: "history", type: "integer", initial: null });
	});

	it("built-ins are read with today's schema — a Variables saved before Append has it", () => {
		const old = { id: "c", packageId: VARIABLES_PACKAGE_ID, alias: "Variables", base: { ...VariablesComponentSchema, actions: VariablesComponentSchema.actions!.slice(0, 1) }, actions: [] };
		expect(ComponentRuntime.parse(old).base.actions!.map(action => action.displayName)).toEqual(["Set", "Append", "Set Field", "Clear"]);
	});

});
