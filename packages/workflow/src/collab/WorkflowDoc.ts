import * as Y from "yjs";
import type { IWorkflowRuntime } from "../domain/entities/IWorkflow.runtime.js";
import type { IBoardRuntime } from "../domain/entities/IBoard.runtime.js";
import type { IComponentRuntime } from "../domain/entities/IComponent.runtime.js";
import type { IActionRuntime } from "../domain/entities/IAction.runtime.js";
import type { IConfigurationRuntime } from "../domain/entities/IConfiguration.runtime.js";
import type { IConnectionRuntime } from "../domain/entities/IConnection.runtime.js";
import type { IVariableRuntime } from "../domain/entities/IVariable.runtime.js";
import { withTriggerNodes } from "../domain/value-objects/TriggerNodes.js";

// IWorkflowRuntime <-> Y.Doc, shared by the hosting (Hocuspocus) and the studio.
//
// Shape of doc.getMap("workflow"):
//
//   version      number                       — WORKFLOW_DOC_VERSION
//   name         string
//   description  string
//   board        Y.Map  { id, packageId, base, connection, configurations: Keyed, actions: Keyed<Action> }
//   start        Y.Map  Action
//   components   Keyed<{ id, packageId, alias, base, actions: Keyed<Action> }>
//   connections  Keyed<{ value: IConnectionRuntime }>
//   variables    Keyed<{ value: IVariableRuntime }>   — absent until the workflow has one
//   platformSettings  Y.Map<number> by SystemConfig key — absent until one is overridden
//   boardOptions      Y.Map<string | number | boolean> by option key — absent until one is picked
//
//   Action = { id, componentId, alias, base, x, y, notes, disabled, inputs, outputs, configurations: Keyed<{ value: IConfigurationRuntime }> }
//
// Every entity with an id lives in a Y.Map keyed by that id (a "Keyed" list)
// instead of a Y.Array, so concurrent edits to different entities never
// conflict and edits to the same one merge per field. Each entry carries an
// `order` so reading back reproduces the array order. `base` (the package
// schema), inputs/outputs and whole configurations are stored as plain JSON —
// atomic, last-writer-wins — since nobody edits them field by field.

export const WORKFLOW_DOC_VERSION = 1;
const ROOT = "workflow";

type Keyed = Y.Map<Y.Map<unknown>>;

const root = (doc: Y.Doc) => doc.getMap<unknown>(ROOT);

/** The shared type everything lives under — what a Y.UndoManager should track. */
export const workflowDocRoot = (doc: Y.Doc) => root(doc);

/** True once the doc has been seeded (an empty doc means "load from JSON"). */
export const isWorkflowDocSeeded = (doc: Y.Doc) => root(doc).has("version");

// ---------------------------------------------------------------- read

const sortedEntries = (keyed: Keyed) =>
	[...keyed.values()].sort((a, b) => {
		const byOrder = (a.get("order") as number) - (b.get("order") as number);
		return byOrder !== 0 ? byOrder : String(a.get("id")).localeCompare(String(b.get("id")));
	});

const readValues = <T>(keyed: Keyed) => sortedEntries(keyed).map(entry => entry.get("value") as T);

const readAction = (m: Y.Map<unknown>): IActionRuntime => {
	const action: IActionRuntime = {
		id: m.get("id") as string,
		componentId: m.get("componentId") as string,
		alias: m.get("alias") as string,
		base: m.get("base") as IActionRuntime["base"],
		configurations: readValues<IConfigurationRuntime>(m.get("configurations") as Keyed),
		inputs: m.get("inputs") as IActionRuntime["inputs"],
		outputs: m.get("outputs") as IActionRuntime["outputs"],
	};
	if (m.has("x")) action.x = m.get("x") as number;
	if (m.has("y")) action.y = m.get("y") as number;
	if (m.has("notes")) action.notes = m.get("notes") as string;
	if (m.get("disabled") === true) action.disabled = true;
	if (typeof m.get("passContext") === "boolean") action.passContext = m.get("passContext") as boolean;
	if (m.get("kind") === "trigger") action.kind = "trigger";
	return action;
};

const readBoard = (m: Y.Map<unknown>): IBoardRuntime => ({
	id: m.get("id") as string,
	packageId: m.get("packageId") as string,
	base: m.get("base") as IBoardRuntime["base"],
	configurations: readValues<IConfigurationRuntime>(m.get("configurations") as Keyed),
	connection: (m.get("connection") ?? null) as IBoardRuntime["connection"],
	actions: sortedEntries(m.get("actions") as Keyed).map(readAction),
});

const readComponent = (m: Y.Map<unknown>): IComponentRuntime => ({
	id: m.get("id") as string,
	packageId: m.get("packageId") as string,
	alias: m.get("alias") as string,
	base: m.get("base") as IComponentRuntime["base"],
	actions: sortedEntries(m.get("actions") as Keyed).map(readAction),
});

// withTriggerNodes: trigger nodes saved with an input read back without one.
export const readWorkflowDoc = (doc: Y.Doc): IWorkflowRuntime => {
	const r = root(doc);
	return withTriggerNodes({
		name: r.get("name") as string,
		description: r.get("description") as string,
		board: readBoard(r.get("board") as Y.Map<unknown>),
		start: readAction(r.get("start") as Y.Map<unknown>),
		components: sortedEntries(r.get("components") as Keyed).map(readComponent),
		connections: readValues<IConnectionRuntime>(r.get("connections") as Keyed),
		...(r.has("variables") && { variables: readValues<IVariableRuntime>(r.get("variables") as Keyed) }),
		...(r.has("platformSettings") && { platformSettings: Object.fromEntries((r.get("platformSettings") as Y.Map<number>).entries()) }),
		...(r.has("boardOptions") && { boardOptions: Object.fromEntries((r.get("boardOptions") as Y.Map<string | number | boolean>).entries()) }),
	} as IWorkflowRuntime);
};

// ---------------------------------------------------------------- write

const deepEqual = (a: unknown, b: unknown): boolean => {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a)) {
		const bArr = b as unknown[];
		return a.length === bArr.length && a.every((v, i) => deepEqual(v, bArr[i]));
	}
	const aKeys = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined);
	const bKeys = Object.keys(b).filter(k => (b as Record<string, unknown>)[k] !== undefined);
	return aKeys.length === bKeys.length
		&& aKeys.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/** Set only when different, so a reconcile with nothing new emits no update. */
const put = (m: Y.Map<unknown>, key: string, value: unknown) => {
	if (value === undefined) {
		if (m.has(key)) m.delete(key);
		return;
	}
	if (!deepEqual(m.get(key), value)) m.set(key, value);
};

const childMap = (m: Y.Map<unknown>, key: string) => {
	let child = m.get(key);
	if (!(child instanceof Y.Map)) {
		child = new Y.Map<unknown>();
		m.set(key, child);
	}
	return child as Y.Map<unknown>;
};

/**
 * Makes `keyed` hold exactly `items` (by id): deletes the missing, updates
 * the existing in place via `write`, appends the new after the current max order.
 */
const reconcileKeyed = <T extends { id: string }>(
	keyed: Keyed,
	items: T[],
	write: (entry: Y.Map<unknown>, item: T) => void,
) => {
	const wanted = new Set(items.map(item => item.id));
	for (const id of [...keyed.keys()]) {
		if (!wanted.has(id)) keyed.delete(id);
	}

	let nextOrder = Math.max(-1, ...[...keyed.values()].map(e => e.get("order") as number)) + 1;

	for (const item of items) {
		let entry = keyed.get(item.id);
		if (!entry) {
			entry = new Y.Map<unknown>();
			keyed.set(item.id, entry);
			entry.set("id", item.id);
			entry.set("order", nextOrder++);
		}
		write(entry, item);
	}
};

const writeValue = <T>(entry: Y.Map<unknown>, value: T) => put(entry, "value", value);

/** Makes `m` hold exactly `record`'s entries — one key per setting, so two edits to different keys merge. */
const reconcileRecord = (m: Y.Map<unknown>, record: Record<string, unknown>) => {
	for (const key of [...m.keys()]) if (!(key in record)) m.delete(key);
	for (const [key, value] of Object.entries(record)) put(m, key, value);
};

const writeAction = (m: Y.Map<unknown>, action: IActionRuntime) => {
	put(m, "id", action.id);
	put(m, "componentId", action.componentId);
	put(m, "alias", action.alias);
	put(m, "base", action.base);
	put(m, "x", action.x);
	put(m, "y", action.y);
	put(m, "notes", action.notes);
	put(m, "disabled", action.disabled || undefined);
	put(m, "passContext", action.passContext);
	put(m, "kind", action.kind);
	put(m, "inputs", action.inputs);
	put(m, "outputs", action.outputs);
	reconcileKeyed(childMap(m, "configurations") as Keyed, action.configurations, writeValue);
};

const writeBoard = (m: Y.Map<unknown>, board: IBoardRuntime) => {
	put(m, "id", board.id);
	put(m, "packageId", board.packageId);
	put(m, "base", board.base);
	put(m, "connection", board.connection);
	reconcileKeyed(childMap(m, "configurations") as Keyed, board.configurations, writeValue);
	reconcileKeyed(childMap(m, "actions") as Keyed, board.actions, writeAction);
};

const writeComponent = (m: Y.Map<unknown>, component: IComponentRuntime) => {
	put(m, "packageId", component.packageId);
	put(m, "alias", component.alias);
	put(m, "base", component.base);
	reconcileKeyed(childMap(m, "actions") as Keyed, component.actions, writeAction);
};

/**
 * Brings the doc to `data`, emitting only what changed. Used both to seed an
 * empty doc and to fold a server-side mutation (the existing HTTP ops) or a
 * local canvas change into the shared doc. `origin` tags the transaction.
 */
export const reconcileWorkflowDoc = (doc: Y.Doc, data: IWorkflowRuntime, origin?: unknown) => {
	doc.transact(() => {
		const r = root(doc);
		put(r, "version", WORKFLOW_DOC_VERSION);
		put(r, "name", data.name);
		put(r, "description", data.description);
		writeBoard(childMap(r, "board"), data.board);
		writeAction(childMap(r, "start"), data.start);
		reconcileKeyed(childMap(r, "components") as Keyed, data.components, writeComponent);
		reconcileKeyed(childMap(r, "connections") as Keyed, data.connections, writeValue);
		// Only once there's something to keep: older workflows don't grow an empty map.
		if (data.variables || r.has("variables")) reconcileKeyed(childMap(r, "variables") as Keyed, data.variables ?? [], writeValue);
		if (data.platformSettings || r.has("platformSettings")) reconcileRecord(childMap(r, "platformSettings"), data.platformSettings ?? {});
		if (data.boardOptions || r.has("boardOptions")) reconcileRecord(childMap(r, "boardOptions"), data.boardOptions ?? {});
	}, origin);
};
