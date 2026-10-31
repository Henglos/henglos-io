import zod from "zod";
import { ShapeSchema, type IShape } from "../schemas/IKSchema.schema.js";
import { isListShape, isObjectShape, validateShape } from "../value-objects/ShapeValue.js";

// A workflow-global value on the board: written by the "Variables / Set" action
// (VariablesComponent.ts), read by any config bound to it (VariableBindingSchema)
// and by scripts (`ctx.var(name)`). It lives in the platform's GlobalVariables,
// apart from the per-run pipeline, so it survives every loop of the program —
// only recording a new program clears it.
//
// On the wire a variable is VARIABLE_ID = generateId("var/<name>") (see
// computeWireVariableId), so `name` is what identifies it on the board and
// renaming it re-keys it; `id` only ties bindings to it inside the workflow.
export const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;

// What the user picks — each maps to one DataType on the board (see
// encodeVariableValue in GenerateExecuteCommand).
//   number  → FLOAT_32     integer → INT_32
//   boolean → BOOL         text    → UINT_8 array (UTF-8)
//   array   → JSON (a list — `shape` says of what)
//   object  → JSON (`shape` says its fields)
export const VariableTypeSchema = zod.enum(["number", "integer", "boolean", "text", "array", "object"]);
// What the user picks — each maps to one DataType on the board (see
// encodeVariableValue in GenerateExecuteCommand).
//   number  → FLOAT_32     integer → INT_32
//   boolean → BOOL         text    → UINT_8 array (UTF-8)
//   array   → JSON (a list — `shape` says of what)
//   object  → JSON (`shape` says its fields)
export type IVariableType = zod.infer<typeof VariableTypeSchema>;

/** A list or an object variable — one whose `shape` says what it holds. */
export const isStructuredVariableType = (type: IVariableType) => type === "array" || type === "object";

// A text value is one LITERAL on the board — the workflow's MAX_DATA_BUFFER
// bytes at most (protocolLimits(workflow).maxData, which platform settings can
// raise). This is the platform's default, for when there's no workflow at hand;
// the cap is the largest MAX_DATA_BUFFER a platform lets a workflow set — all
// the schema itself can check, since it doesn't see the workflow's limits.
export const MAX_VARIABLE_TEXT_BYTES = 512;
/** The most a text variable can ever hold — the largest MAX_DATA_BUFFER a platform allows. */
export const MAX_VARIABLE_TEXT_BYTES_CAP = 4079;

const INT32_MIN = -0x80000000;
const INT32_MAX = 0x7fffffff;

/**
 * Why `initial` isn't a value of `type`, or null when it is (null itself: no
 * initial value). `maxTextBytes`: the workflow's MAX_DATA_BUFFER — a list's or
 * an object's JSON counts against it too. `shape`: an array/object variable's.
 */
export const variableInitialError = (type: IVariableType, initial: unknown, maxTextBytes: number = MAX_VARIABLE_TEXT_BYTES, shape?: IShape): string | null => {
	if (initial === null) return null;
	switch (type) {
		case "array":
		case "object": {
			if (!shape) return "No shape — say what it holds.";
			const problem = validateShape(shape, initial);
			if (problem) return problem;
			const bytes = new TextEncoder().encode(JSON.stringify(initial)).length;
			return bytes <= maxTextBytes ? null : `${bytes} bytes as JSON — at most ${maxTextBytes}.`;
		}
		case "boolean":
			return typeof initial === "boolean" ? null : "Expected true or false.";
		case "number":
			return typeof initial === "number" && Number.isFinite(initial) ? null : "Expected a number.";
		case "integer":
			if (typeof initial !== "number" || !Number.isInteger(initial)) return "Expected a whole number.";
			return initial >= INT32_MIN && initial <= INT32_MAX ? null : `Must be between ${INT32_MIN} and ${INT32_MAX}.`;
		case "text":
			if (typeof initial !== "string") return "Expected text.";
			return new TextEncoder().encode(initial).length <= maxTextBytes ? null : `At most ${maxTextBytes} bytes.`;
	}
};

// TextEncoder: a runtime global in both the browser and Node, missing from
// this package's tsconfig lib (no DOM) — see GenerateExecuteCommand.
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

const VariableShape = zod.object({
	id: zod.string(),
	name: zod.string().regex(VARIABLE_NAME_PATTERN),
	type: VariableTypeSchema,
	// Set on the board when the program starts, unless the variable already
	// holds a value (a loop coming back to Start keeps it). Null: no value
	// until a Set runs — a config bound to it then gets nothing.
	initial: zod.union([zod.number(), zod.boolean(), zod.string(), zod.array(zod.unknown()), zod.record(zod.string(), zod.unknown())]).nullable(),
	// What an "array" or "object" variable holds — { array: … } / { object: … }.
	shape: ShapeSchema.optional(),
}).superRefine((variable, ctx) => {
	if (variable.type === "array" && !isListShape(variable.shape)) {
		ctx.addIssue({ code: "custom", path: ["shape"], message: "An array variable needs a list shape ({ array: … })." });
		return;
	}
	if (variable.type === "object" && !isObjectShape(variable.shape)) {
		ctx.addIssue({ code: "custom", path: ["shape"], message: "An object variable needs an object shape ({ object: … })." });
		return;
	}
	// Only the absolute cap here — the workflow's own limit is checked where the workflow is known.
	const error = variableInitialError(variable.type, variable.initial, MAX_VARIABLE_TEXT_BYTES_CAP, variable.shape);
	if (error) ctx.addIssue({ code: "custom", path: ["initial"], message: error });
});

/** A workflow variable: its name, type, initial value and shape. */
export type IVariableRuntime = zod.infer<typeof VariableShape>;

/**
 * Variables first had a raw DataType per value — `initial: { kind: "int32",
 * value: 5 }` and no `type`. Reads that shape as the simple types; anything
 * already current passes through untouched.
 */
export const migrateVariable = (raw: unknown): unknown => {
	if (!raw || typeof raw !== "object" || "type" in raw) return raw;
	const { initial, ...rest } = raw as { initial?: unknown };
	const legacy = initial && typeof initial === "object" && "kind" in initial
		? initial as { kind: string; value: number | boolean }
		: null;
	const type: IVariableType = !legacy ? "number"
		: legacy.kind === "bool" ? "boolean"
		: /float/.test(legacy.kind) ? "number"
		: "integer";
	return { ...rest, type, initial: legacy ? legacy.value : null };
};

/** A workflow variable — read from older workflows' shape too (migrateVariable). */
export const VariableRuntime = zod.preprocess(migrateVariable, VariableShape);
