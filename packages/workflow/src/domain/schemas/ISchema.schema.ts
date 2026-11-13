import zod from "zod";

// The scalar types a value can be — MicroPython's own, nothing narrower:
// integer (int, int32 on the wire), float (float, float32 on the ESP32) and
// bool. See domain/wire/DataType.ts for how each travels.
export const SCALAR_KINDS = ["integer", "float", "bool"] as const;

/** A scalar's kind: integer, float or bool. */
export const KSchemaKindSchema = zod.enum(SCALAR_KINDS);

// What a value is shaped like — a scalar, a string, a list of one shape, or
// an object with a shape per field, as deep as it goes:
//   integer · string · { list: float } · { object: { ssid: string, rssi: integer } }
//   { list: { object: { x: float, y: float } } }
// A list or an object travels as its JSON (DataType LIST / OBJECT on the board).
export type IShape =
	| IKSchemaKind
	| "string"
	| "any"
	| { list: IShape }
	| { object: { [field: string]: IShape } };

/** What a value is, structurally — see IShape. */
export const ShapeSchema: zod.ZodType<IShape> = zod.lazy(() => zod.union([
	KSchemaKindSchema,
	zod.literal("string"),
	zod.literal("any"),
	zod.object({ list: ShapeSchema }).strict(),
	zod.object({
		object: zod.record(zod.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "a field name: letters, digits and _"), ShapeSchema),
	}).strict(),
])) as zod.ZodType<IShape>;

/** One value an action publishes (its manifest's outputSchema): its name and shape. */
export const KSchemaSchema = zod
	.object({
		name: zod.string(),

		// - a single type: the output is always that (e.g. Delay's Duration is
		//   always an integer).
		// - a list of types: the output is one of these, decided at runtime —
		//   narrower than "any" when the possibilities are known in advance.
		// - "any": the output's type genuinely can't be known ahead of time
		//   (e.g. Loop's Data mirrors whatever its Value list held).
		// - a shape (see ShapeSchema): a string, a list, an object — e.g. Scan's
		//   networks, { list: { object: { ssid: string, rssi: integer } } }.
		type: zod.union([
			KSchemaKindSchema,
			zod.array(KSchemaKindSchema).min(1),
			zod.literal("any"),
			ShapeSchema,
		]),

		description: zod.string().optional(),
	})
	.strict();

/** A scalar's kind: integer, float or bool. */
export type IKSchemaKind = (typeof SCALAR_KINDS)[number];
/** One value an action publishes (its manifest's outputSchema): its name and shape. */
export type IKSchema = zod.infer<typeof KSchemaSchema>;
export type ISchema = IKSchema;
