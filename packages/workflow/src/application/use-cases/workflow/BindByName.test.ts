import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { AddConnectionToWorkflow } from "./AddConnection.use-case.js";
import { RemoveActionFromWorkflowComponent } from "./RemoveActionFromComponent.use-case.js";
import { BindWorkflowActionConfigurationOutput } from "./BindActionConfigurationOutput.use-case.js";
import { outputReaches, SetWorkflowActionPassContext } from "./PassContext.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";
import { getActionOutputs } from "./ResolveNextAction.use-case.js";
import { generateId } from "../../../utils/identifier.js";

const Schema: IComponentSchema = {
	displayName: "Net",
	description: "",
	actions: [
		{ displayName: "Read", description: "", script: "read.py", configurations: [], outputSchema: [{ name: "path", type: "str" }] },
		{ displayName: "Use", description: "", script: "use.py", configurations: [{ displayName: "Input", description: "", type: "string" }] },
	],
};

const setup = () => {
	let workflow: IWorkflowRuntime = new CreateWorkflow().execute("wf", "", { name: "esp32", description: "", pins: [] } as never, "board");
	const added = new AddComponentToWorkflow().execute(workflow, Schema, "net");
	workflow = added.workflow;
	const componentId = added.component.id;
	const add = (name: string) => {
		const result = new AddActionToWorkflowComponent().execute(workflow, componentId, Schema.actions!.find(action => action.displayName === name)!);
		workflow = result.workflow;
		return result.action!;
	};
	const wire = (sourceId: string, targetId: string) => {
		const all = [workflow.start, ...workflow.components.flatMap(component => component.actions)];
		const source = all.find(action => action.id === sourceId)!;
		const target = all.find(action => action.id === targetId)!;
		const handle = (source.id === workflow.start.id ? source.outputs : getActionOutputs(source))[0]!.id;
		workflow = new AddConnectionToWorkflow().execute(workflow, source.id, target.id, handle, target.inputs[0]!.id).workflow;
	};
	const bind = (targetId: string, sourceId: string) => {
		const target = workflow.components[0]!.actions.find(action => action.id === targetId)!;
		workflow = new BindWorkflowActionConfigurationOutput().execute(workflow, componentId, targetId, target.configurations[0]!.id, sourceId, "path");
	};
	return {
		get workflow() { return workflow; }, set workflow(next) { workflow = next; },
		componentId, add, wire, bind,
	};
};

/** The SOURCE ID the EXECUTE of `actionId` binds its config to — undefined when no BIND went out. */
const bindSource = (payload: Uint8Array) => {
	const view = new DataView(payload.buffer);
	let index = 6 + payload[5]! * 4;
	while (index < payload.length) {
		if (payload[index + 2] === 0x01) return view.getUint16(index + 3, true);
		index += 4 + (payload[index + 3]! & 0x80 ? 2 + view.getUint16(index + 4, true) : 1);
	}
	return undefined;
};

describe("a bind goes by the output's name", () => {

	it("keeps working once the action it came from is removed and added again", () => {
		const flow = setup();
		const read = flow.add("Read");
		const use = flow.add("Use");
		flow.wire(flow.workflow.start.id, read.id);
		flow.wire(read.id, use.id);
		flow.bind(use.id, read.id);

		flow.workflow = new RemoveActionFromWorkflowComponent().execute(flow.workflow, flow.componentId, read.id).workflow;
		expect(outputReaches(flow.workflow, use.id, "path")).toBe(false);          // nothing publishes it here now

		const again = flow.add("Read");
		flow.wire(flow.workflow.start.id, again.id);
		flow.wire(again.id, use.id);
		expect(outputReaches(flow.workflow, use.id, "path")).toBe(true);
		expect(bindSource(new GenerateExecuteCommand().execute(flow.workflow, use.id)!)).toBe(generateId("path"));
	});

	it("binds an output from further back, through an action passing its context on", () => {
		const flow = setup();
		const read = flow.add("Read");
		const middle = flow.add("Use");
		const use = flow.add("Use");
		flow.wire(flow.workflow.start.id, read.id);
		flow.wire(read.id, middle.id);
		flow.wire(middle.id, use.id);

		flow.bind(use.id, read.id);
		expect(use.id && flow.workflow.components[0]!.actions.find(action => action.id === use.id)!.configurations[0]!.binding).toBeNull();

		flow.workflow = new SetWorkflowActionPassContext().execute(flow.workflow, flow.componentId, middle.id, true);
		flow.bind(use.id, read.id);
		expect(flow.workflow.components[0]!.actions.find(action => action.id === use.id)!.configurations[0]!.binding).toMatchObject({ outputName: "path" });
	});

});
