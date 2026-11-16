import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { SetBoardOption } from "./SetBoardOption.use-case.js";
import { readWorkflowDoc, reconcileWorkflowDoc } from "../../../collab/WorkflowDoc.js";
import { BoardOptionSchema, boardOptionScope, resolveBoardOptions, type IBoardOption } from "../../../domain/entities/IBoard.schema.js";

const base = () => new CreateWorkflow().execute("wf", "", { name: "esp32", displayName: "ESP32", description: "", connection: { serial: { baudrates: [115200] } }, pins: [{ gpio: 2, type: ["digital_out"], displayName: "GPIO2" }] } as never, "pkg");

const OPTIONS: IBoardOption[] = [
	{ key: "FLASH", displayName: "Flash", description: "", type: "select", default: "4MB", choices: ["4MB", "8MB"] },
	{ key: "PSRAM", displayName: "PSRAM", description: "", type: "boolean", default: false },
	{ key: "CPU", displayName: "CPU", description: "", type: "integer", default: 160, min: 80, max: 240 },
];

describe("board options", () => {

	it("declares what a change redoes — build when it doesn't say", () => {
		const option = { key: "LED", displayName: "LED", description: "", type: "integer" as const, default: 2, min: 0, max: 40 };
		expect(boardOptionScope(BoardOptionSchema.parse(option))).toBe("build");
		expect(boardOptionScope(BoardOptionSchema.parse({ ...option, scope: "runtime" }))).toBe("runtime");
		expect(boardOptionScope(BoardOptionSchema.parse({ ...option, scope: "prepare" }))).toBe("prepare");
		expect(() => BoardOptionSchema.parse({ ...option, scope: "later" })).toThrow();
	});

	it("sets, replaces and clears values — no empty object left behind", () => {
		const set = new SetBoardOption();
		let workflow = set.execute(base(), "FLASH", "8MB");
		workflow = set.execute(workflow, "PSRAM", true);
		expect(workflow.boardOptions).toEqual({ FLASH: "8MB", PSRAM: true });
		workflow = set.execute(workflow, "FLASH", null);
		workflow = set.execute(workflow, "PSRAM", null);
		expect("boardOptions" in workflow).toBe(false);
	});

	it("survives the collaborative doc", () => {
		const doc = new Y.Doc();
		const workflow = new SetBoardOption().execute(base(), "FLASH", "8MB");
		reconcileWorkflowDoc(doc, workflow);
		expect(readWorkflowDoc(doc).boardOptions).toEqual({ FLASH: "8MB" });
		reconcileWorkflowDoc(doc, new SetBoardOption().execute(workflow, "FLASH", null));
		expect(readWorkflowDoc(doc).boardOptions).toEqual({});
	});

	it("resolves to text: what was picked, or the default, and only what the board declares", () => {
		expect(resolveBoardOptions(OPTIONS, { FLASH: "8MB", CPU: 240, OTHER_BOARD: "x" })).toEqual({ FLASH: "8MB", PSRAM: "false", CPU: "240" });
		expect(resolveBoardOptions([], { FLASH: "8MB" })).toEqual({});
	});

	it("refuses what isn't valid for its option", () => {
		expect(() => resolveBoardOptions(OPTIONS, { FLASH: "1GB" })).toThrow(/one of: 4MB, 8MB/);
		expect(() => resolveBoardOptions(OPTIONS, { CPU: 999 })).toThrow(/between 80 and 240/);
		expect(() => resolveBoardOptions(OPTIONS, { PSRAM: "yes" })).toThrow(/true or false/);
	});

	it("refuses a manifest whose default isn't valid", () => {
		expect(BoardOptionSchema.safeParse({ ...OPTIONS[0], default: "1GB" }).success).toBe(false);
		expect(BoardOptionSchema.safeParse(OPTIONS[0]).success).toBe(true);
	});

});
