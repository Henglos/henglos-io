import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { SetPlatformSetting } from "./SetPlatformSetting.use-case.js";
import { readWorkflowDoc, reconcileWorkflowDoc } from "../../../collab/WorkflowDoc.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { UpdateWorkflowActionConfiguration } from "./UpdateActionConfiguration.use-case.js";
import { GenerateExecuteCommand, protocolLimits } from "./GenerateExecuteCommand.use-case.js";
import type { IComponentSchema } from "../../../domain/entities/IComponent.schema.js";

const base = () => new CreateWorkflow().execute("wf", "", { name: "esp32", displayName: "ESP32", description: "", pins: [] } as never, "board-pkg");

describe("platform settings", () => {

	it("sets, replaces and clears overrides — no empty object left behind", () => {
		const set = new SetPlatformSetting();
		let workflow = set.execute(base(), "MAX_VARIABLES", 32);
		workflow = set.execute(workflow, "STREAM_TIMEOUT_MS", 5000);
		workflow = set.execute(workflow, "MAX_VARIABLES", 64);
		expect(workflow.platformSettings).toEqual({ MAX_VARIABLES: 64, STREAM_TIMEOUT_MS: 5000 });

		workflow = set.execute(workflow, "MAX_VARIABLES", null);
		workflow = set.execute(workflow, "STREAM_TIMEOUT_MS", null);
		expect("platformSettings" in workflow).toBe(false);
	});

	it("round-trips through the collab doc, one key per setting", () => {
		const workflow = new SetPlatformSetting().execute(base(), "MAX_RECORD_SIZE", 8192);
		const doc = new Y.Doc();
		reconcileWorkflowDoc(doc, workflow);
		expect(readWorkflowDoc(doc).platformSettings).toEqual({ MAX_RECORD_SIZE: 8192 });

		// Clearing the last override empties the map instead of keeping a stale key.
		reconcileWorkflowDoc(doc, new SetPlatformSetting().execute(workflow, "MAX_RECORD_SIZE", null));
		expect(readWorkflowDoc(doc).platformSettings).toEqual({});

		const legacy = new Y.Doc();
		reconcileWorkflowDoc(legacy, base());
		expect("platformSettings" in readWorkflowDoc(legacy)).toBe(false);
	});

	it("builds packets with the workflow's protocol limits — the same ones the board is compiled with", () => {
		const Display: IComponentSchema = {
			displayName: "Display", description: "",
			actions: [{ displayName: "Show", description: "", script: "show.py", configurations: [{ displayName: "Text", description: "", type: "string" }] }],
		};
		const added = new AddComponentToWorkflow().execute(base(), Display, "display-pkg");
		let workflow = new AddActionToWorkflowComponent().execute(added.workflow, added.component.id, Display.actions![0]!).workflow;
		const show = workflow.components.find(c => c.id === added.component.id)!.actions[0]!;
		workflow = new UpdateWorkflowActionConfiguration().execute(workflow, added.component.id, show.id, show.configurations[0]!.id, "x".repeat(600));

		const generate = new GenerateExecuteCommand();
		expect(() => generate.execute(workflow, show.id)).toThrow(/máximo que a placa aceita é 512/);

		const set = new SetPlatformSetting();
		workflow = set.execute(set.execute(workflow, "MAX_DATA_BUFFER", 700), "MAX_PACKET_SIZE", 2048);
		expect(protocolLimits(workflow)).toMatchObject({ maxData: 700, maxPayload: 2043, maxCode: 192 });
		expect(generate.execute(workflow, show.id)!.length).toBeGreaterThan(600);
	});
});
