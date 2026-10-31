import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { isVariablesComponent, VariablesComponentSchema } from "../../../domain/value-objects/VariablesComponent.js";
import { AddWorkflowVariable } from "./Variables.use-case.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { SetWorkflowActionConfigurationCode } from "./SetActionConfigurationCode.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";
import { generateId } from "../../../utils/identifier.js";

describe("a script in an \"any\" config", () => {

	it("goes out with RESULT TYPE AUTO — a bool into Set's int32-picked Value is kept a bool", () => {
		let workflow: IWorkflowRuntime = new CreateWorkflow().execute("wf", "", { name: "esp32", displayName: "ESP32", description: "", pins: [] } as never, "board-pkg");
		// The first variable brings the Variables component in.
		workflow = new AddWorkflowVariable().execute(workflow, { name: "state", type: "boolean", initial: false }).workflow;
		const component = workflow.components.find(isVariablesComponent)!;
		const schema = VariablesComponentSchema.actions!.find(action => action.displayName === "Set")!;
		const added = new AddActionToWorkflowComponent().execute(workflow, component.id, schema);
		workflow = added.workflow;
		const set = added.action!;
		const value = set.configurations.find(config => config.base.displayName === "Value")!;
		workflow = new SetWorkflowActionConfigurationCode().execute(workflow, set.componentId, set.id, value.id, 'return not ctx.get("state")');

		const payload = new GenerateExecuteCommand().execute(workflow, set.id)!;
		const id = generateId("set/value");
		const at = payload.findIndex((_, i) => payload[i] === (id & 0xff) && payload[i + 1] === id >> 8 && payload[i + 2] === 0x02);
		expect(at).toBeGreaterThan(0);
		expect(payload[at + 3]).toBe(14);
	});

});
