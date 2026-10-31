import { pythonKind, type IKSchemaKind, type IShape } from "../schemas/IKSchema.schema.js";

// Values against shapes (IShape) — checking a value fits one (a config's,
// a variable's), whether an output's shape can feed a config's, a shape as
// words for the studio, and the empty value of a shape (a new list item).
// A shape saved with an old type name (int32, text…) reads as its
// MicroPython type (pythonKind).

// An int travels as INT_32 — what fits in it both ways (see SCALAR_KINDS).
export const INT_RANGE: [number, number] = [-0x80000000, 0x7fffffff];

/** Whether a shape is a list. */
export const isListShape = (shape: unknown): shape is { array: IShape } =>
	!!shape && typeof shape === "object" && "array" in shape;

/** Whether a shape is an object. */
export const isObjectShape = (shape: unknown): shape is { object: Record<string, IShape> } =>
	!!shape && typeof shape === "object" && "object" in shape;

/** A shape a value travels as JSON in — a list or an object. */
export const isJsonShape = (shape: unknown): boolean => isListShape(shape) || isObjectShape(shape);

/** Whether a shape is str (or "text", as it was written before). */
export const isStrShape = (shape: unknown): boolean => pythonKind(shape) === "str";

const isNumberKind = (shape: IShape) => {
	const kind = pythonKind(shape);
	return kind === "int" || kind === "float";
};

/** Why `value` doesn't fit `shape` — "[2].rssi: expected an integer" — or null when it does. */
export function validateShape(shape: IShape, value: unknown, path = ""): string | null {
	const at = (message: string) => `${path || "value"}: ${message}`;

	if (isListShape(shape)) {
		if (!Array.isArray(value)) return at("expected a list");
		for (let i = 0; i < value.length; i++) {
			const problem = validateShape(shape.array, value[i], `${path}[${i}]`);
			if (problem) return problem;
		}
		return null;
	}

	if (isObjectShape(shape)) {
		if (!value || typeof value !== "object" || Array.isArray(value)) return at("expected an object");
		for (const [field, fieldShape] of Object.entries(shape.object)) {
			if (!(field in value)) return at(`missing "${field}"`);
			const problem = validateShape(fieldShape, (value as Record<string, unknown>)[field], path ? `${path}.${field}` : field);
			if (problem) return problem;
		}
		return null;
	}

	const kind = pythonKind(shape);
	if (kind === "str") return typeof value === "string" ? null : at("expected text");
	if (kind === "bool") return typeof value === "boolean" ? null : at("expected true or false");
	if (typeof value !== "number" || !Number.isFinite(value)) return at("expected a number");
	if (kind === "int") {
		if (!Number.isInteger(value)) return at("expected a whole number");
		if (value < INT_RANGE[0] || value > INT_RANGE[1]) return at(`out of int's range (${INT_RANGE[0]} to ${INT_RANGE[1]})`);
	}
	return null;
}

/**
 * Whether a value of `source`'s shape can fill `target`: the same structure,
 * an int or a float for either, and an object with at least the fields the
 * target asks for. "any" (an output that doesn't say) can fill anything.
 */
export function isShapeCompatible(source: IShape | "any" | IKSchemaKind[], target: IShape): boolean {
	if (source === "any" || Array.isArray(source)) return true;
	if (isListShape(target)) return isListShape(source) && isShapeCompatible(source.array, target.array);
	if (isObjectShape(target)) {
		return isObjectShape(source)
			&& Object.entries(target.object).every(([field, shape]) => field in source.object && isShapeCompatible(source.object[field]!, shape));
	}
	if (isJsonShape(source)) return false;
	const kind = pythonKind(target);
	if (kind === "str" || kind === "bool") return pythonKind(source) === kind;
	return isNumberKind(source as IShape);
}

/** A shape as words: "list of { ssid: str, rssi: int }". */
export function shapeLabel(shape: IShape | "any" | IKSchemaKind[]): string {
	if (shape === "any") return "any";
	if (Array.isArray(shape)) return [...new Set(shape.map(pythonKind))].join(" | ");
	if (isListShape(shape)) return `list of ${shapeLabel(shape.array)}`;
	if (isObjectShape(shape)) return `{ ${Object.entries(shape.object).map(([field, inner]) => `${field}: ${shapeLabel(inner)}`).join(", ")} }`;
	return pythonKind(shape);
}

/** The empty value of a shape — what a new list item, or a new object, starts as. */
export function emptyShapeValue(shape: IShape): unknown {
	if (isListShape(shape)) return [];
	if (isObjectShape(shape)) return Object.fromEntries(Object.entries(shape.object).map(([field, inner]) => [field, emptyShapeValue(inner)]));
	const kind = pythonKind(shape);
	if (kind === "str") return "";
	if (kind === "bool") return false;
	return 0;
}
