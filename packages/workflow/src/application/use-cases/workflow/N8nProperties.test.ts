import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { ComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { ConfigurationSchema, nestedProperties, type IConfigurationSchema } from "../../../domain/entities/IConfiguration.schema.js";
import { DataType, isSizedDataType } from "../../../domain/wire/DataType.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { UpdateWorkflowActionConfiguration } from "./UpdateActionConfiguration.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";
import { isConfigurationVisible } from "../../services/ConfigurationVisibility.js";
import { generateId } from "../../../utils/identifier.js";

const parse = (property: unknown) => ConfigurationSchema.parse(property) as IConfigurationSchema;

describe("n8n-style properties", () => {

	it("reads boolean, number, string's typeOptions and options of { name, value }", () => {
		expect(parse({ displayName: "Wait for Image", name: "waitForImage", type: "boolean", default: true }))
			.toMatchObject({ type: "toggle", name: "waitForImage", defaultValue: true, description: "" });

		expect(parse({ displayName: "Amount", name: "amount", type: "number", default: 10, typeOptions: { minValue: 0, maxValue: 10, numberPrecision: 2 } }))
			.toMatchObject({ type: "float", defaultValue: "10", minValue: 0, maxValue: 10, numberPrecision: 2 });
		expect(parse({ displayName: "Count", type: "number", default: 3, typeOptions: { numberPrecision: 0 } }).type).toBe("integer");

		expect(parse({ displayName: "Password", type: "string", default: "", typeOptions: { password: true } }).type).toBe("password");
		expect(parse({ displayName: "HTML", type: "string", default: "", typeOptions: { editor: "htmlEditor" } })).toMatchObject({ type: "code", language: "html" });
		expect(parse({ displayName: "Description", type: "string", default: "", typeOptions: { rows: 4 } })).toMatchObject({ type: "string", rows: 4 });

		expect(parse({ displayName: "Resource", type: "options", default: "image", options: [{ name: "Image", value: "image", description: "x" }, { name: "Count", value: 2 }] }))
			.toMatchObject({ type: "options", defaultValue: "image", options: [{ displayName: "Image", value: "image" }, { displayName: "Count", value: "2" }] });
	});

	it("reads { name, value } inside a category of options too", () => {
		expect(parse({ displayName: "Icon", type: "options", default: "a", options: [{ categoryName: "Status", options: [{ name: "Check", value: "a" }] }] }))
			.toMatchObject({ options: [{ categoryName: "Status", options: [{ displayName: "Check", value: "a" }] }] });
	});

	it("reads the types this schema didn't have", () => {
		expect(parse({ displayName: "Events", type: "multiOptions", default: [], options: [{ name: "Created", value: "created" }] })).toMatchObject({ type: "multiOptions", defaultValue: [] });
		expect(parse({ displayName: "Since", type: "dateTime", default: "" }).type).toBe("dateTime");
		expect(parse({ displayName: "Content", type: "json", default: { a: 1 } })).toMatchObject({ type: "json", defaultValue: '{"a":1}' });
		expect(parse({ displayName: "Read me", name: "notice", type: "notice", default: "" })).toMatchObject({ type: "notice" });

		const collection = parse({
			displayName: "Filters", name: "filters", type: "collection", placeholder: "Add Field", default: {},
			options: [{ displayName: "Type", name: "type", type: "options", default: "", options: [{ name: "Past", value: "past" }] }],
		});
		expect(collection.type).toBe("collection");
		expect(nestedProperties(collection as never)[0]).toMatchObject({ type: "options", options: [{ displayName: "Past", value: "past" }] });

		const fixed = parse({
			displayName: "Metadata", name: "metadataUi", type: "fixedCollection", placeholder: "Add Metadata", default: "", typeOptions: { multipleValues: true },
			options: [{ name: "metadataValues", displayName: "Metadata", values: [
				{ displayName: "Name", name: "name", type: "string", default: "" },
				{ displayName: "Value", name: "value", type: "number", default: 0 },
			] }],
		});
		expect(fixed).toMatchObject({ type: "fixedCollection", multipleValues: true });
		expect(fixed.type === "fixedCollection" && nestedProperties(fixed.options[0]!).map(p => p.type)).toEqual(["string", "float"]);

		expect(parse({ displayName: "Conditions", name: "conditions", type: "filter", default: {}, typeOptions: { filter: { caseSensitive: false } } }))
			.toMatchObject({ type: "filter", caseSensitive: false });
		expect(parse({ displayName: "Fields to Set", name: "assignments", type: "assignmentCollection", default: {} }).type).toBe("assignmentCollection");
	});

	it("takes a category — only where the studio shows it", () => {
		expect(parse({ displayName: "SDA Pin", name: "sdaPin", type: "string", category: "Pins" })).toMatchObject({ category: "Pins" });
		expect(ConfigurationSchema.safeParse({ displayName: "X", type: "string", category: "" }).success).toBe(false);
	});

	it("still reads the old types as they were", () => {
		expect(parse({ displayName: "Level", description: "", type: "toggle" }).type).toBe("toggle");
		expect(parse({ displayName: "Pin", description: "", type: "integer", defaultValue: "2" }).type).toBe("integer");
	});

	it("refuses a nested field that isn't a property", () => {
		expect(ConfigurationSchema.safeParse({ displayName: "Bad", type: "collection", options: [{ displayName: "X", type: "nope" }] }).success).toBe(false);
	});

	it("shows a field by a sibling's name, n8n's way", () => {
		const mode = { id: "a", binding: null, value: "advanced", base: parse({ displayName: "Mode", name: "mode", type: "options", default: "simple", options: [{ name: "Simple", value: "simple" }, { name: "Advanced", value: "advanced" }] }) };
		const extra = { id: "b", binding: null, value: "", base: parse({ displayName: "Extra", type: "string", default: "", displayOptions: { show: { mode: ["advanced"] } } }) };
		expect(isConfigurationVisible(extra, [mode, extra])).toBe(true);
		expect(isConfigurationVisible(extra, [{ ...mode, value: "simple" }, extra])).toBe(false);
	});

});

describe("n8n-style properties on the wire", () => {

	const component = ComponentSchema.parse({
		displayName: "Kit",
		description: "",
		actions: [{
			displayName: "Do",
			description: "",
			script: "do.py",
			configurations: [
				{ displayName: "Note", name: "note", type: "notice", default: "" },
				{ displayName: "Since", name: "since", type: "dateTime", default: "" },
				{ displayName: "Events", name: "events", type: "multiOptions", default: [], options: [{ name: "A", value: "a" }, { name: "B", value: "b" }] },
				{ displayName: "Content", name: "content", type: "json", default: "" },
				{ displayName: "Amount", name: "amount", type: "number", default: 5, typeOptions: { minValue: 0, maxValue: 10 } },
				{ displayName: "Options", name: "options", type: "collection", default: {}, options: [{ displayName: "Retries", name: "retries", type: "number", default: 1 }] },
				{ displayName: "Conditions", name: "conditions", type: "filter", default: {}, typeOptions: { filter: { caseSensitive: false } } },
				{ displayName: "Fields", name: "fields", type: "assignmentCollection", default: {} },
			],
		}],
	});

	const setUp = () => {
		const workflow: IWorkflowRuntime = new CreateWorkflow().execute("wf", "", { name: "esp32", displayName: "ESP32", description: "", pins: [] } as never, "board-pkg");
		const added = new AddComponentToWorkflow().execute(workflow, component, "kit-pkg");
		const action = new AddActionToWorkflowComponent().execute(added.workflow, added.component.id, component.actions![0]!);
		return { workflow: action.workflow, componentId: added.component.id, actionId: action.action!.id };
	};

	/** CONFIG_ID → { DATA_TYPE, its text } of an EXECUTE body's LITERALs. */
	const literals = (payload: Uint8Array) => {
		const view = new DataView(payload.buffer);
		const found = new Map<number, { dataType: number; text: string }>();
		let index = 6 + payload[5]! * 4;
		while (index < payload.length) {
			const dataType = payload[index + 3]!;
			const sized = isSizedDataType(dataType);
			const size = sized ? view.getUint16(index + 4, true) : dataType === DataType.BOOL ? 1 : 4;
			const start = index + 4 + (sized ? 2 : 0);
			found.set(view.getUint16(index, true), { dataType, text: new TextDecoder().decode(payload.slice(start, start + size)) });
			index = start + size;
		}
		return found;
	};

	it("sends each as the action reads it — the notice not at all", () => {
		let { workflow, componentId, actionId } = setUp();
		const set = (name: string, value: unknown) => {
			const config = workflow.components.find(c => c.id === componentId)!.actions[0]!.configurations.find(c => c.base.displayName === name)!;
			workflow = new UpdateWorkflowActionConfiguration().execute(workflow, componentId, actionId, config.id, value as never);
		};
		set("Since", "2026-11-23T14:00");
		set("Events", ["a", "b"]);
		set("Content", '{"x": [1, 2]}');
		set("Options", { retries: 3 });
		set("Conditions", { combinator: "or", conditions: [{ id: "c1", leftValue: "1", operator: "number:gt", rightValue: "0" }] });
		set("Fields", { assignments: [
			{ id: "1", name: "speed", type: "number", value: "12.5" },
			{ id: "2", name: "on", type: "boolean", value: "true" },
			{ id: "3", name: "tags", type: "array", value: '["x"]' },
			{ id: "4", name: "", type: "string", value: "unnamed" },
		] });

		const sent = literals(new GenerateExecuteCommand().execute(workflow, actionId)!);
		const of = (name: string) => sent.get(generateId(`do/${name}`));

		expect(of("note")).toBeUndefined();
		expect(of("since")).toEqual({ dataType: DataType.STRING, text: "2026-11-23T14:00" });
		expect(of("events")!.dataType).toBe(DataType.LIST);
		expect(JSON.parse(of("events")!.text)).toEqual(["a", "b"]);
		expect(JSON.parse(of("content")!.text)).toEqual({ x: [1, 2] });
		expect(of("options")!.dataType).toBe(DataType.OBJECT);
		expect(JSON.parse(of("options")!.text)).toEqual({ retries: 3 });
		expect(JSON.parse(of("conditions")!.text)).toEqual({ combinator: "or", conditions: [{ leftValue: "1", operator: "number:gt", rightValue: "0" }], caseSensitive: false });
		expect(JSON.parse(of("fields")!.text)).toEqual({ speed: 12.5, on: true, tags: ["x"] });
	});

	it("refuses a number past its range, and JSON that doesn't parse", () => {
		let { workflow, componentId, actionId } = setUp();
		const config = (name: string) => workflow.components.find(c => c.id === componentId)!.actions[0]!.configurations.find(c => c.base.displayName === name)!;
		const tooMuch = new UpdateWorkflowActionConfiguration().execute(workflow, componentId, actionId, config("Amount").id, "11");
		expect(() => new GenerateExecuteCommand().execute(tooMuch, actionId)).toThrow(/at most 10/i);
		workflow = new UpdateWorkflowActionConfiguration().execute(workflow, componentId, actionId, config("Content").id, "{nope");
		expect(() => new GenerateExecuteCommand().execute(workflow, actionId)).toThrow(/valid JSON/);
	});

});
