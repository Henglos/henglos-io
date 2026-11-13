import zod from "zod";
import { ShapeSchema, type IShape } from "../schemas/ISchema.schema.js";
import { isListShape, isObjectShape, validateShape } from "../value-objects/ShapeValue.js";
import { INTEGER_RANGE, VALUE_TYPES } from "../wire/DataType.js";

// A workflow-global value on the board: written by the Variables actions
// (VariablesComponent.ts), read by any config bound to it (VariableBindingSchema)
// and by scripts (`ctx.var(name)`). It lives in the platform's GlobalVariables,
// apart from the per-run pipeline, so it survives every loop of the program —
// only recording a new program (or a Remove) clears it.
//
// On the wire a variable is VARIABLE_ID = generateId("var/<name>") (see
// computeWireVariableId), so `name` is what identifies it on the board and
// renaming it re-keys it; `id` only ties bindings to it inside the workflow.
export const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;

// What the user picks — each is one DataType on the board (domain/wire/DataType.ts):
//   integer → INTEGER   float  → FLOAT    bool   → BOOL
//   string  → STRING    list   → LIST (`shape` says of what, or dynamic)
//   object  → OBJECT (`shape` says its fields, or dynamic)
export const VariableTypeSchema = zod.enum(VALUE_TYPES);
export type IVariableType = zod.infer<typeof VariableTypeSchema>;

/** A list or an object variable — one whose `shape` says what it holds. */
export const isStructuredVariableType = (type: IVariableType) => type === "list" || type === "object";

// A string value is one LITERAL on the board — the workflow's MAX_DATA_BUFFER
// bytes at most (protocolLimits(workflow).maxData, which platform settings can
// raise). This is the platform's default, for when there's no workflow at hand;
// the cap is the largest MAX_DATA_BUFFER a platform lets a workflow set — all
// the schema itself can check, since it doesn't see the workflow's limits.
export const MAX_VARIABLE_TEXT_BYTES = 512;
/** The most a string variable can ever hold — the largest MAX_DATA_BUFFER a platform allows. */
export const MAX_VARIABLE_TEXT_BYTES_CAP = 4079;

/**
 * Why `initial` isn't a value of `type`, or null when it is (null itself: no
 * initial value). `maxTextBytes`: the workflow's MAX_DATA_BUFFER — a list's or
 * an object's JSON counts against it too. `shape`: a list/object variable's.
 */
export const variableInitialError = (type: IVariableType, initial: unknown, maxTextBytes: number = MAX_VARIABLE_TEXT_BYTES, shape?: IShape): string | null => {
	if (initial === null) return null;
	switch (type) {
		case "list": {
			if (!Array.isArray(initial)) return "Expected a list.";
			if (shape) {
				const problem = validateShape(shape, initial);
				if (problem) return problem;
			}
			const bytes = new TextEncoder().encode(JSON.stringify(initial)).length;
			return bytes <= maxTextBytes ? null : `${bytes} bytes as JSON — at most ${maxTextBytes}.`;
		}
		case "object": {
			if (!initial || typeof initial !== "object" || Array.isArray(initial)) return "Expected an object.";
			if (shape) {
				const problem = validateShape(shape, initial);
				if (problem) return problem;
			}
			const bytes = new TextEncoder().encode(JSON.stringify(initial)).length;
			return bytes <= maxTextBytes ? null : `${bytes} bytes as JSON — at most ${maxTextBytes}.`;
		}
		case "bool":
			return typeof initial === "boolean" ? null : "Expected true or false.";
		case "float":
			return typeof initial === "number" && Number.isFinite(initial) ? null : "Expected a number.";
		case "integer":
			if (typeof initial !== "number" || !Number.isInteger(initial)) return "Expected an integer.";
			return initial >= INTEGER_RANGE[0] && initial <= INTEGER_RANGE[1] ? null : `Must be between ${INTEGER_RANGE[0]} and ${INTEGER_RANGE[1]}.`;
		case "string":
			if (typeof initial !== "string") return "Expected a string.";
			return new TextEncoder().encode(initial).length <= maxTextBytes ? null : `At most ${maxTextBytes} bytes.`;
	}
};

// TextEncoder: a runtime global in both the browser and Node, missing from
// this package's tsconfig lib (no DOM) — see GenerateExecuteCommand.
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

/** A workflow variable: its name, type, initial value and shape. */
export const VariableRuntime = zod.object({
	id: zod.string(),
	name: zod.string().regex(VARIABLE_NAME_PATTERN),
	type: VariableTypeSchema,
	// Set on the board when the program starts, unless the variable already
	// holds a value (a loop coming back to Start keeps it). Null: no value
	// until a Set runs — a config bound to it then gets nothing.
	initial: zod.union([zod.number(), zod.boolean(), zod.string(), zod.array(zod.unknown()), zod.record(zod.string(), zod.unknown())]).nullable(),
	// What a list or an object variable holds — { list: … } / { object: … }.
	shape: ShapeSchema.optional(),
}).superRefine((variable, ctx) => {
	if (variable.type === "list" && variable.shape && !isListShape(variable.shape)) {
		ctx.addIssue({ code: "custom", path: ["shape"], message: "A list variable needs a list shape ({ list: … })." });
		return;
	}
	if (variable.type === "object" && variable.shape && !isObjectShape(variable.shape)) {
		ctx.addIssue({ code: "custom", path: ["shape"], message: "An object variable needs an object shape ({ object: … })." });
		return;
	}
	// Only the absolute cap here — the workflow's own limit is checked where the workflow is known.
	const error = variableInitialError(variable.type, variable.initial, MAX_VARIABLE_TEXT_BYTES_CAP, variable.shape);
	if (error) ctx.addIssue({ code: "custom", path: ["initial"], message: error });
});

/** A workflow variable: its name, type, initial value and shape. */
export type IVariableRuntime = zod.infer<typeof VariableRuntime>;
