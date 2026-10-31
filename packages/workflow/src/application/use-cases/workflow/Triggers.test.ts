import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { ComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { AddConnectionToWorkflow } from "./AddConnection.use-case.js";
import { SetWorkflowActionDisabled } from "./SetActionDisabled.use-case.js";
import { withoutDisabledActions } from "./WithoutDisabledActions.js";
import { ResolveRecordSequence } from "./ResolveRecordSequence.use-case.js";
import { computeWireOutputId, getActionOutputs, SUCCESS_OUTPUT_ID } from "./ResolveNextAction.use-case.js";
import { isEntryAction, isTriggerAction, workflowEntries } from "./WorkflowEntries.js";
import { computeComponentStorageName } from "./ResolveWorkflowAction.js";
import { withTriggerNodes, withTriggerNodesRaw } from "../../../domain/value-objects/TriggerNodes.js";

const LedSchema: IComponentSchema = {
	displayName: "Led",
	description: "",
	actions: [{ displayName: "Write", description: "", script: "write.py", configurations: [] }],
};

// A component with triggers (its `triggers:`), the way GPIO and Time have theirs.
const ClockSchema: IComponentSchema = {
	displayName: "Clock",
	description: "",
	triggers: [
		{ displayName: "Timer", description: "", script: "timer.py", outputSchema: [{ name: "count", type: "int" }] },
		{ displayName: "Pin", description: "", script: "pin.py" },
	],
};

const trigger = (name: string) => ClockSchema.triggers!.find(schema => schema.displayName === name)!;

/** Start → a; Timer → b; Pin (no wire). */
const rig = () => {
	let workflow: IWorkflowRuntime = new CreateWorkflow().execute("wf", "", { name: "esp32", description: "", pins: [] } as never, "board");
	const added = new AddComponentToWorkflow().execute(workflow, LedSchema, "led");
	workflow = added.workflow;

	const add = (componentId: string, schema: typeof LedSchema.actions extends (infer A)[] | undefined ? A : never) => {
		const result = new AddActionToWorkflowComponent().execute(workflow, componentId, schema);
		workflow = result.workflow;
		return result.action!;
	};
	const clock = new AddComponentToWorkflow().execute(workflow, ClockSchema, "clock");
	workflow = clock.workflow;
	const clockId = clock.component.id;

	const a = add(added.component.id, LedSchema.actions![0]!);
	const b = add(added.component.id, LedSchema.actions![0]!);
	const timer = add(clockId, trigger("Timer"));
	const pin = add(clockId, trigger("Pin"));

	const wire = (sourceId: string, targetId: string) => {
		const all = [workflow.start, ...workflow.components.flatMap(component => component.actions)];
		const source = all.find(action => action.id === sourceId)!;
		const target = all.find(action => action.id === targetId)!;
		const sourceHandle = (source.id === workflow.start.id ? source.outputs : getActionOutputs(source))[0]!.id;
		const result = new AddConnectionToWorkflow().execute(workflow, source.id, target.id, sourceHandle, target.inputs[0]?.id ?? "default");
		workflow = result.workflow;
		return result.connection;
	};
	wire(workflow.start.id, a.id);
	wire(timer.id, b.id);

	return { get workflow() { return workflow; }, set workflow(next) { workflow = next; }, clockId, a, b, timer, pin, wire };
};

describe("a component's triggers", () => {

	it("are a valid part of its schema", () => {
		expect(ComponentSchema.safeParse(ClockSchema).success).toBe(true);
	});

	it("refuses a trigger named like one of the component's actions", () => {
		const clash = { ...LedSchema, triggers: [{ displayName: "Write", description: "", script: "t.py" }] };
		expect(ComponentSchema.safeParse(clash).success).toBe(false);
	});

	it("take their ACTION_ID like an action's (<component>/<trigger>)", () => {
		expect(computeComponentStorageName(ClockSchema.displayName, "Timer")).toBe("clock/timer");
	});

});

describe("a trigger node", () => {

	it("has no input and only Out — no Fallback", () => {
		const { timer } = rig();
		expect(isTriggerAction(timer)).toBe(true);
		expect(timer.inputs).toHaveLength(0);
		const outputs = getActionOutputs(timer);
		expect(outputs.map(output => output.base.name)).toEqual(["Out"]);
		expect(computeWireOutputId(timer, outputs[0]!.base.id)).toBe(SUCCESS_OUTPUT_ID);
	});

	it("can't be wired into — nor can Start", () => {
		const { a, pin, workflow, wire } = rig();
		expect(isEntryAction(workflow, pin.id)).toBe(true);
		expect(wire(a.id, pin.id)).toBeNull();
		expect(wire(a.id, workflow.start.id)).toBeNull();
	});

});

describe("the workflow's entries", () => {

	it("are Start, then each trigger", () => {
		const { workflow, timer, pin } = rig();
		expect(workflowEntries(workflow)).toEqual([workflow.start.id, timer.id, pin.id]);
	});

	it("record from every entry: Start's branch, then each trigger's", () => {
		const { workflow, a, b, timer, pin } = rig();
		expect(new ResolveRecordSequence().execute(workflow)).toEqual([workflow.start.id, a.id, timer.id, b.id, pin.id]);
	});

	it("leave a disabled trigger out — and its branch with it", () => {
		const state = rig();
		state.workflow = new SetWorkflowActionDisabled().execute(state.workflow, state.clockId, state.timer.id, true);
		const running = withoutDisabledActions(state.workflow);
		expect(workflowEntries(running)).toEqual([running.start.id, state.pin.id]);
		expect(new ResolveRecordSequence().execute(running)).toEqual([running.start.id, state.a.id, state.pin.id]);
	});

});

describe("a trigger saved without its kind", () => {

	// What an old save looks like: no kind, an input, a wire into it.
	const old = () => {
		const state = rig();
		const workflow = state.workflow;
		const components = workflow.components.map(component => ({
			...component,
			actions: component.actions.map(action => action.id === state.pin.id
				? { ...action, kind: undefined, inputs: [{ id: "in-1", base: { id: "default", name: "In" } }] }
				: action),
		}));
		const connections = [...workflow.connections, { id: "c-old", source: state.a.id, target: state.pin.id, sourceHandle: "x", targetHandle: "in-1" }];
		return { state, workflow: { ...workflow, components, connections } };
	};

	it("reads back as a trigger: its kind, no input, nothing wired into it", () => {
		const { state, workflow } = old();
		// withTriggerNodesRaw: what WorkflowRuntime's parse runs first.
		for (const fixed of [withTriggerNodes(workflow), withTriggerNodesRaw(workflow) as typeof workflow]) {
			const pin = fixed.components.flatMap(component => component.actions).find(action => action.id === state.pin.id)!;
			expect(isTriggerAction(pin)).toBe(true);
			expect(pin.inputs).toHaveLength(0);
			expect(fixed.connections.some(connection => connection.target === state.pin.id)).toBe(false);
		}
	});

	it("leaves a workflow with nothing to fix as it is", () => {
		const { workflow } = rig();
		expect(withTriggerNodes(workflow)).toBe(workflow);
	});

	it("takes the old `trigger: true` on its schema as its kind — and drops the flag", () => {
		const state = rig();
		const workflow = {
			...state.workflow,
			components: state.workflow.components.map(component => ({
				...component,
				actions: component.actions.map(action => action.id === state.timer.id ? { ...action, kind: undefined, base: { ...action.base, trigger: true } } : action),
			})),
		};
		const timer = withTriggerNodes(workflow).components.flatMap(component => component.actions).find(action => action.id === state.timer.id)!;
		expect(timer.kind).toBe("trigger");
		expect("trigger" in timer.base).toBe(false);
	});

});
