import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { AddConnectionToWorkflow } from "./AddConnection.use-case.js";
import { SetWorkflowActionDisabled } from "./SetActionDisabled.use-case.js";
import { withoutDisabledActions } from "./WithoutDisabledActions.js";
import { getActionOutputs, ResolveNextAction, SUCCESS_OUTPUT_ID } from "./ResolveNextAction.use-case.js";
import { readWorkflowDoc, reconcileWorkflowDoc } from "../../../collab/WorkflowDoc.js";

const LedSchema: IComponentSchema = {
	displayName: "Led",
	description: "",
	actions: [{ displayName: "Write", description: "", script: "write.py", configurations: [] }],
};

/** Start → a → b → c, all Led Writes, wired through their Success outputs. */
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

	const disable = (actionId: string) => {
		workflow = new SetWorkflowActionDisabled().execute(workflow, componentId, actionId, true);
	};

	return { get workflow() { return workflow; }, componentId, a, b, c, disable, wire };
};

const edges = (workflow: IWorkflowRuntime) => workflow.connections.map(connection => `${connection.source}->${connection.target}`);

describe("withoutDisabledActions", () => {

	it("leaves a workflow with nothing disabled as it is", () => {
		const flow = chain();
		expect(withoutDisabledActions(flow.workflow)).toBe(flow.workflow);
	});

	it("passes through a disabled action to the next one", () => {
		const flow = chain();
		flow.disable(flow.b.id);
		const runnable = withoutDisabledActions(flow.workflow);

		expect(runnable.components[0]!.actions.map(action => action.id)).toEqual([flow.a.id, flow.c.id]);
		expect(edges(runnable)).toEqual([`${flow.workflow.start.id}->${flow.a.id}`, `${flow.a.id}->${flow.c.id}`]);
		// The host walking the graph goes from a straight to c.
		expect(new ResolveNextAction().execute(runnable, flow.a.id, SUCCESS_OUTPUT_ID)).toBe(flow.c.id);
	});

	it("passes through a chain of disabled actions", () => {
		const flow = chain();
		flow.disable(flow.a.id);
		flow.disable(flow.b.id);
		const runnable = withoutDisabledActions(flow.workflow);

		expect(edges(runnable)).toEqual([`${flow.workflow.start.id}->${flow.c.id}`]);
		// Lands on c's own input handle.
		expect(runnable.connections[0]!.targetHandle).toBe(flow.c.inputs[0]?.id ?? "default");
	});

	it("ends the path at a disabled action with nothing after it", () => {
		const flow = chain();
		flow.disable(flow.c.id);
		const runnable = withoutDisabledActions(flow.workflow);

		expect(edges(runnable)).toEqual([`${flow.workflow.start.id}->${flow.a.id}`, `${flow.a.id}->${flow.b.id}`]);
		expect(new ResolveNextAction().execute(runnable, flow.b.id, SUCCESS_OUTPUT_ID)).toBeUndefined();
	});

	it("doesn't loop forever on a cycle of disabled actions", () => {
		const flow = chain();
		flow.wire(flow.c.id, flow.b.id);
		flow.disable(flow.b.id);
		flow.disable(flow.c.id);
		const runnable = withoutDisabledActions(flow.workflow);

		expect(edges(runnable)).toEqual([`${flow.workflow.start.id}->${flow.a.id}`]);
	});

	it("never disables Start", () => {
		const flow = chain();
		const result = new SetWorkflowActionDisabled().execute(flow.workflow, "start", flow.workflow.start.id, true);
		expect(result.start.disabled).toBeUndefined();
	});

	it("drops the flag when re-enabled, and keeps it through the collab doc", () => {
		const flow = chain();
		flow.disable(flow.b.id);

		const doc = new Y.Doc();
		reconcileWorkflowDoc(doc, flow.workflow);
		const read = readWorkflowDoc(doc);
		expect(read.components[0]!.actions.find(action => action.id === flow.b.id)!.disabled).toBe(true);
		expect(read.components[0]!.actions.find(action => action.id === flow.a.id)!.disabled).toBeUndefined();

		const enabled = new SetWorkflowActionDisabled().execute(flow.workflow, flow.componentId, flow.b.id, false);
		expect("disabled" in enabled.components[0]!.actions.find(action => action.id === flow.b.id)!).toBe(false);
	});

});
