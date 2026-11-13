import type { IKSchemaKind, IShape } from "../schemas/ISchema.schema.js";
import { INTEGER_RANGE } from "../wire/DataType.js";

// Values against shapes (IShape) — checking a value fits one (a config's,
// a variable's), whether an output's shape can feed a config's, a shape as
// words for the studio, and the empty value of a shape (a new list item).

/** Whether a shape is a list. */
export const isListShape = (shape: unknown): shape is { list: IShape } =>
	!!shape && typeof shape === "object" && "list" in shape;

/** Whether a shape is an object. */
export const isObjectShape = (shape: unknown): shape is { object: Record<string, IShape> } =>
	!!shape && typeof shape === "object" && "object" in shape;

/** A shape a value travels as JSON in — a list or an object. */
export const isJsonShape = (shape: unknown): boolean => isListShape(shape) || isObjectShape(shape);

/** Whether a shape is a string. */
export const isStringShape = (shape: unknown): boolean => shape === "string";

const isNumberKind = (shape: IShape) => shape === "integer" || shape === "float";

/** Why `value` doesn't fit `shape` — "[2].rssi: expected an integer" — or null when it does. */
export function validateShape(shape: IShape, value: unknown, path = ""): string | null {
	const at = (message: string) => `${path || "value"}: ${message}`;

	if (shape === "any") return null;

	if (isListShape(shape)) {
		if (!Array.isArray(value)) return at("expected a list");
		if (shape.list === "any") return null;
		for (let i = 0; i < value.length; i++) {
			const problem = validateShape(shape.list, value[i], `${path}[${i}]`);
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

	if (shape === "string") return typeof value === "string" ? null : at("expected a string");
	if (shape === "bool") return typeof value === "boolean" ? null : at("expected true or false");
	if (typeof value !== "number" || !Number.isFinite(value)) return at("expected a number");
	if (shape === "integer") {
		if (!Number.isInteger(value)) return at("expected an integer");
		if (value < INTEGER_RANGE[0] || value > INTEGER_RANGE[1]) return at(`out of an integer's range (${INTEGER_RANGE[0]} to ${INTEGER_RANGE[1]})`);
	}
	return null;
}

/**
 * Whether a value of `source`'s shape can fill `target`: the same structure,
 * an integer or a float for either, and an object with at least the fields the
 * target asks for. "any" (an output that doesn't say) can fill anything.
 */
export function isShapeCompatible(source: IShape | "any" | IKSchemaKind[], target: IShape): boolean {
	if (source === "any" || Array.isArray(source)) return true;
	if (target === "any") return true;
	if (isListShape(target)) {
		return isListShape(source) && (target.list === "any" || source.list === "any" || isShapeCompatible(source.list, target.list));
	}
	if (isObjectShape(target)) {
		if (Object.keys(target.object).length === 0) {
			return isObjectShape(source);
		}
		if (!isObjectShape(source)) return false;
		return Object.entries(target.object).every(([field, shape]) => field in source.object && isShapeCompatible(source.object[field]!, shape));
	}
	if (isJsonShape(source)) return false;
	if (target === "string" || target === "bool") return source === target;
	return isNumberKind(source as IShape);
}

/** A shape as words: "list of { ssid: string, rssi: integer }". */
export function shapeLabel(shape: IShape | "any" | IKSchemaKind[]): string {
	if (shape === "any") return "any";
	if (Array.isArray(shape)) return [...new Set(shape)].join(" | ");
	if (isListShape(shape)) return shape.list === "any" ? "list" : `list of ${shapeLabel(shape.list)}`;
	if (isObjectShape(shape)) {
		if (Object.keys(shape.object).length === 0) return "object";
		return `{ ${Object.entries(shape.object).map(([field, inner]) => `${field}: ${shapeLabel(inner)}`).join(", ")} }`;
	}
	return shape;
}

/** The empty value of a shape — what a new list item, or a new object, starts as. */
export function emptyShapeValue(shape: IShape): unknown {
	if (shape === "any") return null;
	if (isListShape(shape)) return [];
	if (isObjectShape(shape)) {
		return Object.fromEntries(Object.entries(shape.object).map(([field, inner]) => [field, emptyShapeValue(inner)]));
	}
	if (shape === "string") return "";
	if (shape === "bool") return false;
	return 0;
}
