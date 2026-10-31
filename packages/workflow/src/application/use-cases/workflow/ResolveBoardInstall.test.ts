import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { ComponentSchema, type IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { LOGIC_COMPONENT_ID, LogicComponentSchema } from "../../../domain/value-objects/LogicComponent.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { UpdateWorkflowActionConfiguration } from "./UpdateActionConfiguration.use-case.js";
import { SetWorkflowActionDisabled } from "./SetActionDisabled.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";
import { credentialBoardPath, fileBoardPath, ResolveBoardInstall } from "./ResolveBoardInstall.use-case.js";
import { mapWorkflowFileValues, workflowFileValues } from "./WorkflowFileValues.js";
import { mapWorkflowCredentialValues, workflowCredentialIds } from "./WorkflowCredentialValues.js";
import { generateId } from "../../../utils/identifier.js";

const DisplaySchema: IComponentSchema = {
	displayName: "Display",
	description: "",
	actions: [
		{ displayName: "Print", description: "", script: "src/print.py" },
		{ displayName: "Clear", description: "", script: "src/clear.py" },
		{
			displayName: "Image", description: "", script: "src/image.py",
			configurations: [{ displayName: "Bitmap", description: "", type: "file", accept: ["image/*"] }],
		},
	],
};
const GpioSchema: IComponentSchema = {
	displayName: "GPIO",
	description: "",
	actions: [{ displayName: "Write", description: "", script: "src/write.py" }, { displayName: "Read", description: "", script: "src/read.py" }],
};

const baseWorkflow = (): IWorkflowRuntime =>
	new CreateWorkflow().execute("wf", "", { name: "esp32", description: "", pins: [] } as never, "board-pkg");

const add = (workflow: IWorkflowRuntime, componentId: string, schema: IComponentSchema, action: string) => {
	const result = new AddActionToWorkflowComponent().execute(workflow, componentId, schema.actions!.find(a => a.displayName === action)!);
	return { workflow: result.workflow, action: result.action! };
};

const BITMAP = { fileId: "file-1", name: "Logo.PNG", size: 1032, mime: "image/x-portable-bitmap", sha256: "a".repeat(64) };

describe("ResolveBoardInstall", () => {

	it("installs only the actions on the canvas — each once — and skips components without any", () => {
		let workflow = baseWorkflow();
		const display = new AddComponentToWorkflow().execute(workflow, DisplaySchema, "display-pkg");
		const gpio = new AddComponentToWorkflow().execute(display.workflow, GpioSchema, "gpio-pkg");
		workflow = gpio.workflow;
		workflow = add(workflow, display.component.id, DisplaySchema, "Print").workflow;
		workflow = add(workflow, display.component.id, DisplaySchema, "Print").workflow;      // a second Print node

		const install = new ResolveBoardInstall().execute(workflow);
		expect(install.components).toEqual([{
			packageId: "display-pkg",
			displayName: "Display",
			module: "display",
			actions: [{ displayName: "Print", module: "print", script: "src/print.py" }],
		}]);
	});

	it("leaves out disabled actions and the built-ins", () => {
		let workflow = baseWorkflow();
		const gpio = new AddComponentToWorkflow().execute(workflow, GpioSchema, "gpio-pkg");
		const added = add(gpio.workflow, gpio.component.id, GpioSchema, "Read");
		workflow = new SetWorkflowActionDisabled().execute(added.workflow, gpio.component.id, added.action.id, true);
		workflow = add(workflow, LOGIC_COMPONENT_ID, LogicComponentSchema, "If").workflow;

		expect(new ResolveBoardInstall().execute(workflow).components).toEqual([]);
	});

	it("collects attached files, at a content-addressed board path the frame carries", () => {
		let workflow = baseWorkflow();
		const display = new AddComponentToWorkflow().execute(workflow, DisplaySchema, "display-pkg");
		const added = add(display.workflow, display.component.id, DisplaySchema, "Image");
		const bitmap = added.action.configurations[0]!;
		workflow = new UpdateWorkflowActionConfiguration().execute(added.workflow, display.component.id, added.action.id, bitmap.id, BITMAP);

		const path = fileBoardPath(BITMAP);
		expect(path).toBe("/files/aaaaaaaaaaaa.png");
		expect(new ResolveBoardInstall().execute(workflow).files).toEqual([{ fileId: "file-1", sha256: BITMAP.sha256, path }]);

		// The EXECUTE carries the path as text (an array of uint8).
		const payload = new GenerateExecuteCommand().execute(workflow, added.action.id)!;
		const view = new DataView(payload.buffer);
		const entry = 6 + payload[5]! * 4;
		expect(view.getUint16(entry, true)).toBe(generateId("image/bitmap"));
		const size = view.getUint16(entry + 4, true);
		expect(new TextDecoder().decode(payload.slice(entry + 6, entry + 6 + size))).toBe(path);
	});

	it("lists every file value — disabled actions' too — and rewrites them (an import's new ids)", () => {
		let workflow = baseWorkflow();
		const display = new AddComponentToWorkflow().execute(workflow, DisplaySchema, "display-pkg");
		const added = add(display.workflow, display.component.id, DisplaySchema, "Image");
		workflow = new UpdateWorkflowActionConfiguration().execute(added.workflow, display.component.id, added.action.id, added.action.configurations[0]!.id, BITMAP);
		workflow = new SetWorkflowActionDisabled().execute(workflow, display.component.id, added.action.id, true);

		expect(new ResolveBoardInstall().execute(workflow).files).toEqual([]);      // disabled: not on the board
		expect(workflowFileValues(workflow)).toEqual([BITMAP]);                    // but exported

		const moved = mapWorkflowFileValues(workflow, value => ({ ...value, fileId: "file-2" }));
		expect(workflowFileValues(moved).map(value => value.fileId)).toEqual(["file-2"]);
		const cleared = mapWorkflowFileValues(workflow, () => null);
		expect(workflowFileValues(cleared)).toEqual([]);
	});

	const WifiSchema: IComponentSchema = {
		displayName: "WiFi",
		description: "",
		credentials: [{ name: "wifi", displayName: "WiFi Network", fields: [
			{ name: "ssid", displayName: "SSID", type: "string", required: true },
			{ name: "password", displayName: "Password", type: "string", secret: true },
		] }],
		actions: [{
			displayName: "Connect", description: "", script: "src/connect.py",
			configurations: [{ displayName: "Network", description: "", type: "credential", credential: "wifi" }],
		}],
	};

	it("collects the credentials picked — by id, each once — and the frame carries only their board path", () => {
		let workflow = baseWorkflow();
		const wifi = new AddComponentToWorkflow().execute(workflow, WifiSchema, "wifi-pkg");
		const first = add(wifi.workflow, wifi.component.id, WifiSchema, "Connect");
		workflow = new UpdateWorkflowActionConfiguration().execute(first.workflow, wifi.component.id, first.action.id, first.action.configurations[0]!.id, { credentialId: "cred-1" });
		const second = add(workflow, wifi.component.id, WifiSchema, "Connect");
		workflow = new UpdateWorkflowActionConfiguration().execute(second.workflow, wifi.component.id, second.action.id, second.action.configurations[0]!.id, { credentialId: "cred-1" });

		const path = credentialBoardPath("cred-1");
		expect(path).toBe("/secrets/cred-1.json");
		expect(new ResolveBoardInstall().execute(workflow).credentials).toEqual([{ credentialId: "cred-1", path }]);

		const payload = new GenerateExecuteCommand().execute(workflow, first.action.id)!;
		const view = new DataView(payload.buffer);
		const entry = 6 + payload[5]! * 4;
		expect(view.getUint16(entry, true)).toBe(generateId("connect/network"));
		const size = view.getUint16(entry + 4, true);
		expect(new TextDecoder().decode(payload.slice(entry + 6, entry + 6 + size))).toBe(path);
	});

	it("lists every credential picked and rewrites them (an import clears the ones not the importer's)", () => {
		let workflow = baseWorkflow();
		const wifi = new AddComponentToWorkflow().execute(workflow, WifiSchema, "wifi-pkg");
		const added = add(wifi.workflow, wifi.component.id, WifiSchema, "Connect");
		workflow = new UpdateWorkflowActionConfiguration().execute(added.workflow, wifi.component.id, added.action.id, added.action.configurations[0]!.id, { credentialId: "cred-9" });

		expect(workflowCredentialIds(workflow)).toEqual(["cred-9"]);
		expect(workflowCredentialIds(mapWorkflowCredentialValues(workflow, () => null))).toEqual([]);
	});

	it("a component schema with credentials parses; a bad type name doesn't", () => {
		expect(ComponentSchema.safeParse(WifiSchema).success).toBe(true);
		expect(ComponentSchema.safeParse({ ...WifiSchema, credentials: [{ ...WifiSchema.credentials![0]!, name: "WiFi Net" }] }).success).toBe(false);
	});

});
