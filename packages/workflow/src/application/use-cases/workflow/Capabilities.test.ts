import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { ComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import { BoardSchema } from "../../../domain/entities/IBoard.schema.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddComponentToWorkflow } from "./AddComponent.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { SetWorkflowActionDisabled } from "./SetActionDisabled.use-case.js";
import { missingCapabilities, unsupportedNodes } from "./Capabilities.use-case.js";

const Http: IComponentSchema = {
	displayName: "HTTP",
	description: "",
	capabilities: ["wifi"],
	actions: [{ displayName: "Request", description: "", script: "request.py" }],
};

const Radio: IComponentSchema = {
	displayName: "Radio",
	description: "",
	actions: [
		{ displayName: "Status", description: "", script: "status.py" },
		{ displayName: "Scan", description: "", script: "scan.py", capabilities: ["bluetooth"] },
	],
};

const workflowOn = (capabilities?: ("wifi" | "bluetooth")[]) => {
	let workflow: IWorkflowRuntime = new CreateWorkflow().execute("wf", "", { name: "esp32", description: "", pins: [] } as never, "board");
	workflow = { ...workflow, board: { ...workflow.board, base: { ...workflow.board.base, ...(capabilities && { capabilities }) } } };
	const nodes: Record<string, string> = {};
	for (const schema of [Http, Radio]) {
		const added = new AddComponentToWorkflow().execute(workflow, schema, schema.displayName.toLowerCase());
		workflow = added.workflow;
		for (const action of schema.actions!) {
			const result = new AddActionToWorkflowComponent().execute(workflow, added.component.id, action);
			workflow = result.workflow;
			nodes[`${schema.displayName}/${action.displayName}`] = result.action!.id;
		}
	}
	return { workflow, nodes };
};

describe("capabilities", () => {

	it("are a closed list in manifests", () => {
		expect(ComponentSchema.safeParse({ ...Http, capabilities: ["wfi"] }).success).toBe(false);
		expect(BoardSchema.shape.capabilities.safeParse(["wifi", "bluetooth"]).success).toBe(true);
	});

	it("a board that says nothing isn't checked", () => {
		expect(missingCapabilities({}, ["wifi"])).toEqual([]);
		expect(unsupportedNodes(workflowOn().workflow)).toEqual([]);
	});

	it("flags what the board lacks — a component's need, and an action's own", () => {
		const { workflow, nodes } = workflowOn([]);
		const unsupported = unsupportedNodes(workflow);
		expect(unsupported.map(node => [node.actionId, node.missing])).toEqual([
			[nodes["HTTP/Request"], ["wifi"]],
			[nodes["Radio/Scan"], ["bluetooth"]],
		]);
		expect(unsupported[0]!.label).toBe("HTTP › Request");
	});

	it("passes on a board that has them, and leaves disabled nodes out", () => {
		expect(unsupportedNodes(workflowOn(["wifi", "bluetooth"]).workflow)).toEqual([]);

		const { workflow, nodes } = workflowOn(["wifi"]);
		const radio = workflow.components.find(component => component.base.displayName === "Radio")!;
		const off = new SetWorkflowActionDisabled().execute(workflow, radio.id, nodes["Radio/Scan"]!, true);
		expect(unsupportedNodes(off)).toEqual([]);
	});

});
