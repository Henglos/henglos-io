import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { IWorkflowRuntime } from "../domain/entities/IWorkflow.runtime.js";
import { isWorkflowDocSeeded, readWorkflowDoc, reconcileWorkflowDoc } from "./WorkflowDoc.js";

const action = (id: string, componentId: string, x?: number) => ({
	id,
	componentId,
	alias: `alias-${id}`,
	base: { displayName: id, nested: { deep: [1, 2, 3] } },
	configurations: [
		{ id: `${id}-c1`, base: { type: "number" }, binding: null, value: "1" },
		{ id: `${id}-c2`, base: { type: "toggle" }, binding: null, value: true },
	],
	inputs: [{ id: `${id}-in`, base: { id: "default", name: "in" } }],
	outputs: [],
	...(x !== undefined ? { x, y: x * 2 } : {}),
});

const fixture = (): IWorkflowRuntime => ({
	name: "wf",
	description: "desc",
	board: {
		id: "board",
		packageId: "pkg-board",
		base: { name: "esp32" },
		configurations: [{ id: "b-c1", base: { type: "text" }, binding: null, value: "x" }],
		connection: null,
		actions: [action("b-a1", "board")],
	},
	start: action("start", "start", 0),
	components: [
		{ id: "comp-b", packageId: "pkg-1", alias: "led", base: { name: "led" }, actions: [action("a1", "comp-b", 10), action("a2", "comp-b", 20)] },
		{ id: "comp-a", packageId: "pkg-2", alias: "btn", base: { name: "btn" }, actions: [] },
	],
	connections: [
		{ id: "conn-2", source: "a1", target: "a2", sourceHandle: "o", targetHandle: "i" },
		{ id: "conn-1", source: "start", target: "a1", sourceHandle: "o", targetHandle: "i" },
	],
}) as unknown as IWorkflowRuntime;

const updateCount = (doc: Y.Doc, fn: () => void) => {
	let count = 0;
	const onUpdate = () => count++;
	doc.on("update", onUpdate);
	fn();
	doc.off("update", onUpdate);
	return count;
};

describe("WorkflowDoc", () => {

	it("round-trips a workflow, keeping array order", () => {
		const doc = new Y.Doc();
		expect(isWorkflowDocSeeded(doc)).toBe(false);

		reconcileWorkflowDoc(doc, fixture());

		expect(isWorkflowDocSeeded(doc)).toBe(true);
		expect(readWorkflowDoc(doc)).toEqual(fixture());
	});

	it("emits no update when nothing changed", () => {
		const doc = new Y.Doc();
		reconcileWorkflowDoc(doc, fixture());

		expect(updateCount(doc, () => reconcileWorkflowDoc(doc, fixture()))).toBe(0);
	});

	it("applies adds, removes and edits", () => {
		const doc = new Y.Doc();
		reconcileWorkflowDoc(doc, fixture());

		const next = fixture();
		next.components[0].actions[0].x = 99;
		next.components[0].actions.splice(1, 1);
		next.components.push({ ...next.components[1], id: "comp-c", actions: [] });
		next.connections = next.connections.filter(c => c.id !== "conn-2");
		next.start.configurations[0] = { ...next.start.configurations[0], value: "42" };

		reconcileWorkflowDoc(doc, next);

		expect(readWorkflowDoc(doc)).toEqual(next);
	});

	it("merges concurrent edits to different entities", () => {
		const a = new Y.Doc();
		reconcileWorkflowDoc(a, fixture());
		const b = new Y.Doc();
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

		const fromA = fixture();
		fromA.components[0].actions[0].x = 111;
		reconcileWorkflowDoc(a, fromA);

		const fromB = fixture();
		fromB.connections.push({ id: "conn-3", source: "a2", target: "a1", sourceHandle: "o", targetHandle: "i" });
		reconcileWorkflowDoc(b, fromB);

		Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

		const merged = readWorkflowDoc(a);
		expect(merged).toEqual(readWorkflowDoc(b));
		expect(merged.components[0].actions[0].x).toBe(111);
		expect(merged.connections.map(c => c.id)).toEqual(["conn-2", "conn-1", "conn-3"]);
	});

});
