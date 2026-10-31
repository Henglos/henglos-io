import zod from "zod";

// The scalar types a value can be — MicroPython's own: it has one int (as
// wide as it needs) and one float (32-bit on the ESP32). On the wire an int
// travels as INT_32 and a float as FLOAT_32, which is what the board's
// encode_value sends back too (see GenerateExecuteCommand's wireKind).
export const SCALAR_KINDS = ["int", "float", "bool"] as const;

// Manifests and workflows written before had a C-like type per width —
// int8…uint32, float8…ufloat32 — and "text" for str. They still read, as the
// MicroPython type they always were on the board.
const LEGACY_KINDS: Record<string, string> = {
	uint8: "int", uint16: "int", uint32: "int",
	int8: "int", int16: "int", int32: "int",
	ufloat8: "float", ufloat16: "float", ufloat32: "float",
	float8: "float", float16: "float", float32: "float",
	text: "str",
};

/** A type name as it's written now — "int32" → "int", "text" → "str"; anything else as it is. */
export const pythonKind = <T>(kind: T): T =>
	(typeof kind === "string" && kind in LEGACY_KINDS ? LEGACY_KINDS[kind] : kind) as T;

/**
 * A raw workflow or schema with every legacy type name renamed, however deep:
 * an output's type, a shape's fields, an "any" value's kind. "text" is left
 * alone — it's also a variable's type (IVariable.runtime.ts) — and read as
 * "str" where a shape is checked (pythonKind).
 */
export function withPythonKinds(raw: unknown): unknown {
	if (typeof raw === "string") return raw !== "text" ? pythonKind(raw) : raw;
	if (Array.isArray(raw)) {
		let changed = false;
		const next = raw.map(item => {
			const fixed = withPythonKinds(item);
			if (fixed !== item) changed = true;
			return fixed;
		});
		return changed ? next : raw;
	}
	if (raw && typeof raw === "object") {
		let changed = false;
		const next: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(raw)) {
			const fixed = withPythonKinds(value);
			if (fixed !== value) changed = true;
			next[key] = fixed;
		}
		return changed ? next : raw;
	}
	return raw;
}

/** A scalar's kind: int, float or bool (older names read too). */
export const KSchemaKindSchema = zod.preprocess(pythonKind, zod.enum(SCALAR_KINDS));

// What a value is shaped like — a scalar, str, a list of one shape, or an
// object with a shape per field, as deep as it goes:
//   int · str · { array: float } · { object: { ssid: str, rssi: int } }
//   { array: { object: { x: float, y: float } } }
// A list or an object travels as its JSON (DataType JSON on the board).
export type IShape =
	| IKSchemaKind
	| "str"
	| { array: IShape }
	| { object: { [field: string]: IShape } };

/** What a value is, structurally — see IShape. */
export const ShapeSchema: zod.ZodType<IShape> = zod.lazy(() => zod.union([
	KSchemaKindSchema,
	zod.preprocess(pythonKind, zod.literal("str")),
	zod.object({ array: ShapeSchema }).strict(),
	zod.object({ object: zod.record(zod.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "a field name: letters, digits and _"), ShapeSchema) }).strict(),
])) as zod.ZodType<IShape>;

/** One value an action publishes (its manifest's outputSchema): its name and shape. */
export const KSchemaSchema = zod
	.object({
		name: zod.string(),

		// - a single type: the output is always that (e.g. Delay's Duration is
		//   always an int).
		// - a list of types: the output is one of these, decided at runtime —
		//   narrower than "any" when the possibilities are known in advance.
		// - "any": the output's type genuinely can't be known ahead of time
		//   (e.g. Loop's Data mirrors whatever its Value list held).
		// - a shape (see ShapeSchema): str, a list, an object — e.g. Scan's
		//   networks, { array: { object: { ssid: str, rssi: int } } }.
		type: zod.union([
			KSchemaKindSchema,
			zod.array(KSchemaKindSchema).min(1),
			zod.literal("any"),
			ShapeSchema,
		]),

		description: zod.string().optional(),
	})
	.strict();

/** A scalar's kind: int, float or bool. */
export type IKSchemaKind = (typeof SCALAR_KINDS)[number];
/** One value an action publishes (its manifest's outputSchema): its name and shape. */
export type IKSchema = zod.infer<typeof KSchemaSchema>;
