import { describe, expect, it } from "vitest";
import { DataType } from "../../../domain/wire/DataType.js";
import * as Y from "yjs";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { AddConnectionToWorkflow } from "./AddConnection.use-case.js";
import { SetWorkflowActionDisabled } from "./SetActionDisabled.use-case.js";
import { actionPassesContext, contextSourcesOf, PASS_CONTEXT_CONFIG_ID, SetWorkflowActionPassContext } from "./PassContext.use-case.js";
import { GenerateExecuteCommand } from "./GenerateExecuteCommand.use-case.js";
import { getActionOutputs } from "./ResolveNextAction.use-case.js";
import { readWorkflowDoc, reconcileWorkflowDoc } from "../../../collab/WorkflowDoc.js";
import { LOGIC_COMPONENT_ID, LogicComponentSchema } from "../../../domain/value-objects/LogicComponent.js";

const LedSchema: IComponentSchema = {
	displayName: "Led",
	description: "",
	actions: [{ displayName: "Write", description: "", script: "write.py", configurations: [] }],
};

/** Start → a → b → c, all Led Writes. */
const chain = () => {
	let workflow: IWorkflowRuntime = new CreateWorkflow().execute("wf", "", { name: "esp32", description: "", pins: [] } as never, "board");
	const added = new AddComponentToWorkflow().execute(workflow, LedSchema, "led");
	workflow = added.workflow;
	const componentId = added.component.id;

	const add = () => {
		const result = new AddActionToWorkflowComponent().execute(workflow, componentId, LedSchema.actions![0]!);
		workflow = result.workflow;
		return result.action!;
	};
	const [a, b, c] = [add(), add(), add()];

	const wire = (sourceId: string, targetId: string) => {
		const all = [workflow.start, ...workflow.components.flatMap(component => component.actions)];
		const source = all.find(action => action.id === sourceId)!;
		const target = all.find(action => action.id === targetId)!;
		const sourceHandle = (source.id === workflow.start.id ? source.outputs : getActionOutputs(source))[0]!.id;
		workflow = new AddConnectionToWorkflow().execute(workflow, source.id, target.id, sourceHandle, target.inputs[0]?.id ?? "default").workflow;
	};
	wire(workflow.start.id, a.id);
	wire(a.id, b.id);
	wire(b.id, c.id);

	return {
		get workflow() { return workflow; },
		set workflow(next) { workflow = next; },
		componentId, a, b, c,
		pass: (actionId: string, on: boolean) => { workflow = new SetWorkflowActionPassContext().execute(workflow, componentId, actionId, on); },
	};
};

// The flag's entry as GenerateExecuteCommand writes it: CONFIG_ID(16) LITERAL BOOL 1.
const hasFlag = (payload: Uint8Array) => {
	const flag = [PASS_CONTEXT_CONFIG_ID & 0xff, PASS_CONTEXT_CONFIG_ID >> 8, 0x00, DataType.BOOL, 1];
	return payload.some((_, i) => flag.every((byte, j) => payload[i + j] === byte));
};

describe("Pass Context", () => {

	it("hands an action only the outputs of the one right before it, by default", () => {
		const flow = chain();
		expect([...contextSourcesOf(flow.workflow, flow.c.id)]).toEqual([flow.b.id]);
		expect(actionPassesContext(flow.workflow, flow.b.id)).toBe(false);
	});

	it("reaches further back through an action that passes it on", () => {
		const flow = chain();
		flow.pass(flow.b.id, true);
		expect(contextSourcesOf(flow.workflow, flow.c.id)).toEqual(new Set([flow.b.id, flow.a.id]));
		flow.pass(flow.a.id, true);
		expect(contextSourcesOf(flow.workflow, flow.c.id)).toEqual(new Set([flow.b.id, flow.a.id, flow.workflow.start.id]));
	});

	it("passes through a disabled action, like the flow does", () => {
		const flow = chain();
		flow.workflow = new SetWorkflowActionDisabled().execute(flow.workflow, flow.componentId, flow.b.id, true);
		expect([...contextSourcesOf(flow.workflow, flow.c.id)]).toEqual([flow.a.id]);
	});

	it("keeps the field off the action when it's set back to its default", () => {
		const flow = chain();
		flow.pass(flow.b.id, true);
		expect(flow.workflow.components[0]!.actions.find(action => action.id === flow.b.id)!.passContext).toBe(true);
		flow.pass(flow.b.id, false);
		expect("passContext" in flow.workflow.components[0]!.actions.find(action => action.id === flow.b.id)!).toBe(false);
	});

	it("is on by default for Logic's actions", () => {
		const flow = chain();
		const result = new AddActionToWorkflowComponent().execute(flow.workflow, LOGIC_COMPONENT_ID, LogicComponentSchema.actions!.find(action => action.displayName === "If")!);
		expect(actionPassesContext(result.workflow, result.action!.id)).toBe(true);
	});

	it("sends the flag in the EXECUTE of an action that passes it on — and only then", () => {
		const flow = chain();
		expect(hasFlag(new GenerateExecuteCommand().execute(flow.workflow, flow.b.id)!)).toBe(false);
		flow.pass(flow.b.id, true);
		expect(hasFlag(new GenerateExecuteCommand().execute(flow.workflow, flow.b.id)!)).toBe(true);
	});

	it("survives the collab doc", () => {
		const flow = chain();
		flow.pass(flow.b.id, true);
		const doc = new Y.Doc();
		reconcileWorkflowDoc(doc, flow.workflow);
		const read = readWorkflowDoc(doc);
		expect(read.components[0]!.actions.find(action => action.id === flow.b.id)!.passContext).toBe(true);
	});

});
