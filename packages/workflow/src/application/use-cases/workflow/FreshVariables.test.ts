import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { DataType, isSizedDataType } from "../../../domain/wire/DataType.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddWorkflowVariable } from "./AddWorkflowVariable.use-case.js";
import { GenerateExecuteCommand, START_FRESH_CONFIG_ID } from "./GenerateExecuteCommand.use-case.js";
import { generateId } from "../../../utils/identifier.js";

/** The CONFIG_IDs of an EXECUTE body's LITERAL entries. */
const configIds = (payload: Uint8Array) => {
	const view = new DataView(payload.buffer);
	const ids: number[] = [];
	let index = 6 + payload[5]! * 4;
	while (index < payload.length) {
		ids.push(view.getUint16(index, true));
		const dataType = payload[index + 3]!;
		const sized = isSizedDataType(dataType);
		const size = sized ? view.getUint16(index + 4, true) : dataType === DataType.BOOL ? 1 : 4;
		index += 4 + (sized ? 2 : 0) + size;
	}
	return ids;
};

describe("a Start that begins a session (freshVariables)", () => {

	const workflow: IWorkflowRuntime = new AddWorkflowVariable().execute(
		new CreateWorkflow().execute("wf", "", { name: "esp32", displayName: "ESP32", description: "", pins: [] } as never, "board-pkg"),
		{ name: "SAFE", type: "float", initial: 20 },
	).workflow;
	const generate = new GenerateExecuteCommand();

	it("carries start/fresh — and the variables' initial values", () => {
		const ids = configIds(generate.execute(workflow, workflow.start.id, undefined, { freshVariables: true })!);
		expect(START_FRESH_CONFIG_ID).toBe(generateId("start/fresh"));
		expect(ids).toContain(START_FRESH_CONFIG_ID);
		expect(ids).toContain(generateId("var/safe"));
	});

	it("doesn't, by default — Start's loops keep what the program wrote", () => {
		expect(configIds(generate.execute(workflow, workflow.start.id)!)).not.toContain(START_FRESH_CONFIG_ID);
	});

});
