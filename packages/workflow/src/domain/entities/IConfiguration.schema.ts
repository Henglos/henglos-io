
import zod from "zod";
import { isValidRegex, PARAM_PATTERN_NAMES, SIMPLE_PATTERN_NAMES } from "../../patterns/registry.js";
import { PinSchema } from "./IPin.schema.js";
import { ShapeSchema } from "../schemas/ISchema.schema.js";
import { VALUE_TYPES } from "../wire/DataType.js";

/** A config bound to another action's config, by name. */
export const BindingSchema = zod.object({
	actionId: zod.string(),
	configurationName: zod.string().min(1),
}).strict();

/** A config bound to an earlier action's output, by name. */
export const OutputBindingSchema = zod.object({
	actionId: zod.string(),
	outputName: zod.string().min(1),
}).strict();

// A config's value resolved on-device by running MicroPython instead of a fixed
// literal or another action's published output — see PacketCodec.py's VALUE
// TYPE 0x02 CODE / CodeLink and ScriptEngine.py. `code` runs as the body of a
// function on-device (`ctx.get(name)` reads shared values), so it needs an explicit `return <value>`
// to produce anything ("return distance < 10", or several statements ending in
// one) — same convention as the "code" base type's script field, just scoped
// to a single config value instead of a whole action. Distinct shape from
// BindingSchema/OutputBindingSchema (no actionId) since a Code binding has no
// source action at all — it can read *any* action's published output via
// ctx.get(name) inside the script itself, not just one wired upstream neighbor.
export const CodeBindingSchema = zod.object({
	code: zod.string(),
}).strict();

// A config's value read from a workflow variable (IVariable.runtime.ts) when
// the action runs — PacketCodec.py's VALUE TYPE 0x04 VARIABLE. Unlike an
// output binding it has no source action, so no connection is required: the
// variable is global to the workflow.
export const VariableBindingSchema = zod.object({
	variableId: zod.string(),
}).strict();

// One input filter of a string/password/integer/float config — see patterns/registry.ts
// for the names and what each checks:
//   - Email                                   a named filter
//   - { name: MaxLength, value: 16 }          a filter that takes a number
//   - { regex: "^[a-z]", message: "…" }       a custom regex (message optional)
export const PatternSchema = zod.union([
	zod.enum(SIMPLE_PATTERN_NAMES),
	zod.object({
		name: zod.enum(PARAM_PATTERN_NAMES),
		value: zod.number(),
	}).strict(),
	zod.object({
		regex: zod.string().min(1).refine(isValidRegex, "Not a valid regular expression"),
		message: zod.string().optional(),
	}).strict(),
]);

// How a config's filters combine: every one must pass (default), or any one.
export const PatternMatchSchema = zod.enum(["all", "any"]);

/** A property's identifier (n8n's `name`): what displayOptions and a collection's value key it by. */
export const PropertyNameSchema = zod.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "an identifier: letters, digits and _");

const BaseConfigurationSchema = zod.object({
	id: zod.number().optional(),

	displayName: zod.string().min(1),
	// n8n's `name` — optional: without one a config is known by its displayName
	// (what its wire id is made of either way, see computeWireConfigId).
	name: PropertyNameSchema.optional(),
	description: zod.string().default(""),
	// A line under the field (n8n's parameter hint).
	hint: zod.string().optional(),
	// The section it shows in — "Pins", "Metadata"…: the configs of a category
	// together, under its title. Only how the studio lays them out.
	category: zod.string().min(1).optional(),

	defaultValue: zod.any().optional(),
	required: zod.boolean().optional(),

	// Shown under the node's Advanced tab instead of Configuration. Purely
	// presentational: it stays in the same `configurations` list, so wire ids,
	// bindings and displayOptions (which reference siblings by displayName,
	// across both tabs) are unaffected, and moving a config between tabs in a
	// new package version is a one-field change.
	advanced: zod.boolean().optional(),

	bind: zod.object({
		schemas: zod.array(zod.string()).min(1),
	}).optional(),

	depends: zod.string().array().optional(),

	displayOptions: zod.object({
		show: zod.record(
			zod.string(),
			zod.array(zod.union([zod.string(), zod.number()])),
		).optional(),

		hide: zod.record(
			zod.string(),
			zod.array(zod.union([zod.string(), zod.number()])),
		).optional(),

		disabled: zod.record(
			zod.string(),
			zod.array(zod.union([zod.string(), zod.number()])),
		).optional(),

	}).optional(),

});

/** A text field. */
export const StringInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("string"),
	defaultValue: zod.string().optional(),

	placeholder: zod.string().optional(),
	// Lines shown — a multi-line text box past 1 (n8n's typeOptions.rows).
	rows: zod.number().int().positive().optional(),
	patterns: zod.array(PatternSchema).optional(),
	patternMatch: PatternMatchSchema.optional(),
}).strict();

/** A text field shown masked. */
export const PasswordInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("password"),
	defaultValue: zod.string().optional(),

	placeholder: zod.string().optional(),
	patterns: zod.array(PatternSchema).optional(),
	patternMatch: PatternMatchSchema.optional(),
}).strict();

/** An on/off switch. */
export const ToggleInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("toggle"),
	defaultValue: zod.boolean().optional(),

	label: zod.string().optional(),
}).strict();

// A number field — a math expression is fine ("50 * 2"). `integer` takes a
// whole number (an int on the board — an expression must come out whole),
// `float` any (a float on the board).
const numberInput = <T extends "integer" | "float">(type: T) => BaseConfigurationSchema.extend({
	type: zod.literal(type),
	defaultValue: zod.string().optional(),

	placeholder: zod.string().optional(),
	patterns: zod.array(PatternSchema).optional(),
	patternMatch: PatternMatchSchema.optional(),

	// n8n's typeOptions: the range it takes, and the decimals it shows.
	minValue: zod.number().optional(),
	maxValue: zod.number().optional(),
	numberPrecision: zod.number().int().min(0).optional(),

}).strict();

/** A whole-number field — an int on the board. */
export const IntegerInputSchema = numberInput("integer");

/** A number field — a float on the board. */
export const FloatInputSchema = numberInput("float");

/** Whether a config's type is a number field (integer or float). */
export const isNumberConfigType = (type: string): type is "integer" | "float" => type === "integer" || type === "float";

/** A color picker. */
export const ColorInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("color"),
	defaultValue: zod.string().optional(),

	hasTransparency: zod.boolean().optional(),
}).strict();

// Multi-line source text edited in a real code editor (Monaco) instead of a
// plain input — wire-encoded identically to "string" (raw UTF-8 bytes, see
// encodeConfigurationValue's default case), this only changes how the studio
// renders the field. `language` picks the editor's syntax highlighting/
// tokenizer (e.g. "lua" for the Code component's own script field) — not a
// wire concept at all.
export const CodeInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("code"),
	defaultValue: zod.string().optional(),

	language: zod.string().optional(),
	placeholder: zod.string().optional(),
}).strict();

/** One choice of an options field. */
export const OptionValueSchema = zod
	.object({
		displayName: zod.string().min(1),
		value: zod.string(),
	})
	.strict();

// A grouped submenu of flat options (e.g. a Dropdown section header) — no
// "value" of its own, just a label plus the options nested under it. Distinct
// from OptionValueSchema by its required keys alone ({displayName, options} vs
// {displayName, value}), so a plain (non-discriminated) union already parses
// each entry unambiguously without needing an extra tag field.
export const OptionCategorySchema = zod
	.object({
		categoryName: zod.string().min(1),
		options: zod.array(OptionValueSchema).min(1),
	})
	.strict();

/** One entry of an options field: a choice, or a category of them. */
export const OptionEntrySchema = zod.union([OptionValueSchema, OptionCategorySchema]);

/** A dropdown of choices. */
export const OptionsSchema = BaseConfigurationSchema.extend({
	type: zod.literal("options"),
	defaultValue: zod.string().optional(),

	// Each entry is either a flat value or a category grouping several values —
	// see OptionEntrySchema.
	options: zod.array(OptionEntrySchema).min(1),
}).strict();

/** A pin picker — the board's pins, filtered by what they support. */
export const PinOptionsSchema = BaseConfigurationSchema.extend({
	type: zod.literal("pin"),
	defaultValue: PinSchema.optional(),

	from: zod.enum(["component", "board"]),
	filterBy: PinSchema.shape.type.optional()
}).strict();

// Raw byte array (0-255 each) — for data that doesn't fit any other type's
// wire shape, e.g. a chunk of packed pixel bytes. Unlike "string", this isn't
// UTF-8 text: an arbitrary byte >= 0x80 would corrupt under TextEncoder, so
// values travel as a plain number array instead. No manual-entry UI widget is
// expected for this type — it's meant to be set via binding or a script, not
// typed in by hand.
export const BytesInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("bytes"),
	defaultValue: zod.array(zod.number().int().min(0).max(255)).optional(),
}).strict();

// The types an "any" value can be typed in as — a value type, like a
// variable's (VALUE_TYPES): integer, float, bool, string, list or object. A
// field lists the ones it takes (`availables`).
export const AnyValueKindSchema = zod.enum(VALUE_TYPES);

/** Why `value` isn't a value of `kind`, or null when it is. */
const anyValueError = (kind: zod.infer<typeof AnyValueKindSchema>, value: unknown): string | null => {
	switch (kind) {
		case "integer": return Number.isInteger(value) ? null : "Expected an integer.";
		case "float": return typeof value === "number" && Number.isFinite(value) ? null : "Expected a number.";
		case "bool": return typeof value === "boolean" ? null : "Expected true or false.";
		case "string": return typeof value === "string" ? null : "Expected a string.";
		case "list": return Array.isArray(value) ? null : "Expected a list.";
		case "object": return value !== null && typeof value === "object" && !Array.isArray(value) ? null : "Expected an object.";
	}
};

/** A value of an `any` field: its kind and the value. */
export const AnyValueSchema = zod.object({
	kind: AnyValueKindSchema,
	value: zod.union([zod.number(), zod.boolean(), zod.string(), zod.array(zod.unknown()), zod.record(zod.string(), zod.unknown())]),
}).strict().superRefine((any, ctx) => {
	const error = anyValueError(any.kind, any.value);
	if (error) ctx.addIssue({ code: "custom", path: ["value"], message: error });
});

/** A field that takes a value of any of the kinds it lists. */
export const AnySchema = BaseConfigurationSchema.extend({
	type: zod.literal("any"),
	availables: zod.array(AnyValueKindSchema).min(1),

	defaultValue: AnyValueSchema.optional(),
}).strict();

// Picks one of the workflow's variables (its IVariableRuntime id) — the
// "Variable" config of the Variables actions. Wire-encoded as the variable's
// VARIABLE_ID, a LITERAL INTEGER (see buildConfigEntry).
export const VariableInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("variable"),
	defaultValue: zod.string().optional(),
}).strict();

// A file the user attaches in the studio (stored by the hosting, per
// workflow). It reaches the board's filesystem with the components, when a
// session starts (see ResolveBoardInstall) — the config itself carries only
// where it is there: its board path, as text. `image`: the studio converts a
// picked image to that format first (a 1-bit PBM fitting maxWidth x
// maxHeight), so the action reads a ready bitmap.
export const FileImageSchema = zod.object({
	format: zod.literal("pbm"),
	maxWidth: zod.number().int().positive(),
	maxHeight: zod.number().int().positive(),
}).strict();

/** A file to attach (an image, a certificate…) — it goes on the board with the session. */
export const FileInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("file"),
	// What the picker offers: MIME types or extensions ("image/*", ".pbm").
	accept: zod.array(zod.string()).optional(),
	// Bytes, after any conversion — at most what the hosting stores (64 KB).
	maxSize: zod.number().int().positive().optional(),
	image: FileImageSchema.optional(),
}).strict();

/** An attached file, as a config holds it. */
export const FileValueSchema = zod.object({
	fileId: zod.string(),
	name: zod.string(),
	size: zod.number().int().nonnegative(),
	mime: zod.string(),
	sha256: zod.string().regex(/^[0-9a-f]{64}$/),
}).strict();

// A list of values of one shape — numbers, text, objects… (see ShapeSchema):
// typed in the studio row by row, or bound to an output / a variable / a
// script of the same shape. On the board it arrives as a list (its JSON).
export const ListInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("list"),
	items: ShapeSchema,
	maxItems: zod.number().int().positive().optional(),
	defaultValue: zod.array(zod.unknown()).optional(),
}).strict();

// An object: named fields, each of its own shape. Arrives as a dict (its JSON).
export const ObjectFieldSchema = zod.object({
	name: zod.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "a field name: letters, digits and _"),
	displayName: zod.string().min(1),
	description: zod.string().optional(),
	type: ShapeSchema,
}).strict();

/** A form of named fields — its value is an object. */
export const ObjectInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("object"),
	fields: zod.array(ObjectFieldSchema).min(1),
	defaultValue: zod.record(zod.string(), zod.unknown()).optional(),
}).strict();

// One of the user's credentials (see ICredentialType.schema.ts), of the type
// `credential` names — the WiFi network, an API token. The workflow holds
// only which one; the hosting puts its values on the board (/secrets) when a
// session starts, and the config carries their path there, as text.
export const CredentialInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("credential"),
	credential: zod.string().min(1),
}).strict();

/** A picked credential, as a config holds it — by id. */
export const CredentialValueSchema = zod.object({
	credentialId: zod.string().min(1),
}).strict();

// ─── n8n's other property types ─────────────────────────────────────────────

/** A date and time picker — its value an ISO 8601 text ("2026-11-23T14:00"), as text on the board. */
export const DateTimeInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("dateTime"),
	defaultValue: zod.string().optional(),
	placeholder: zod.string().optional(),
}).strict();

/** Several choices at once — its value the chosen values' list, a list on the board. */
export const MultiOptionsSchema = BaseConfigurationSchema.extend({
	type: zod.literal("multiOptions"),
	defaultValue: zod.array(zod.string()).optional(),
	options: zod.array(OptionEntrySchema).min(1),
}).strict();

/** JSON typed in an editor — a list or an object on the board (sent parsed). */
export const JsonInputSchema = BaseConfigurationSchema.extend({
	type: zod.literal("json"),
	defaultValue: zod.string().optional(),
	rows: zod.number().int().positive().optional(),
}).strict();

/** A note in the node (its displayName is the text) — no value, nothing sent. */
export const NoticeSchema = BaseConfigurationSchema.extend({
	type: zod.literal("notice"),
	tone: zod.enum(["info", "warning", "danger"]).optional(),
}).strict();

/**
 * Optional fields, added one by one ("Add option") — its value an object of
 * the ones added, keyed by their name (or displayName). Literal values only:
 * the collection as a whole binds to an output, a variable or a script.
 */
// A collection's / a group's fields: configs themselves — validated as such
// (lazily: they're of this same schema), typed loosely to keep the type from
// referencing itself; nestedProperties() reads them typed.
const NestedPropertiesSchema = zod.array(zod.lazy((): zod.ZodType<unknown> => ConfigurationSchema)).min(1);

export const CollectionSchema = BaseConfigurationSchema.extend({
	type: zod.literal("collection"),
	placeholder: zod.string().optional(),
	defaultValue: zod.record(zod.string(), zod.unknown()).optional(),
	options: NestedPropertiesSchema,
}).strict();

/** One group of a fixedCollection: its fields. */
export const FixedCollectionGroupSchema = zod.object({
	name: PropertyNameSchema,
	displayName: zod.string().min(1),
	values: NestedPropertiesSchema,
}).strict();

/**
 * Groups of fields — with `multipleValues`, rows of them, added and removed
 * (n8n's fixedCollection). Its value: { <group name>: <row> } — or a list of
 * rows with `multipleValues`. Literal values only, like a collection.
 */
export const FixedCollectionSchema = BaseConfigurationSchema.extend({
	type: zod.literal("fixedCollection"),
	placeholder: zod.string().optional(),
	multipleValues: zod.boolean().optional(),
	sortable: zod.boolean().optional(),
	defaultValue: zod.record(zod.string(), zod.unknown()).optional(),
	options: zod.array(FixedCollectionGroupSchema).min(1),
}).strict();

/** One condition of a filter: a value, how it's tested ("<type>:<operation>", see LOGIC_OPERATIONS) and against what. */
export const FilterConditionSchema = zod.object({
	id: zod.string(),
	leftValue: zod.string().default(""),
	operator: zod.string().min(1),
	rightValue: zod.string().optional(),
}).strict();

/** A filter's value: its conditions, joined by AND or OR. */
export const FilterValueSchema = zod.object({
	combinator: zod.enum(["and", "or"]).default("and"),
	conditions: zod.array(FilterConditionSchema).default([]),
}).strict();

/** Conditions, joined by AND / OR — the action evaluates them on the board (henglosio.sdk's filter). */
export const FilterSchema = BaseConfigurationSchema.extend({
	type: zod.literal("filter"),
	placeholder: zod.string().optional(),
	caseSensitive: zod.boolean().optional(),
	defaultValue: FilterValueSchema.optional(),
}).strict();

/** The types an assignment's value can be. */
export const AssignmentTypeSchema = zod.enum(["string", "number", "boolean", "array", "object"]);

/** One name / value pair of an assignmentCollection. */
export const AssignmentSchema = zod.object({
	id: zod.string(),
	name: zod.string(),
	type: AssignmentTypeSchema.default("string"),
	value: zod.unknown(),
}).strict();

/** An assignmentCollection's value. */
export const AssignmentCollectionValueSchema = zod.object({
	assignments: zod.array(AssignmentSchema).default([]),
}).strict();

/** Name / value pairs, each of its type (n8n's Edit Fields) — an object on the board. */
export const AssignmentCollectionSchema = BaseConfigurationSchema.extend({
	type: zod.literal("assignmentCollection"),
	defaultValue: AssignmentCollectionValueSchema.optional(),
}).strict();

// The editors n8n's typeOptions.editor names, as the code editor's language.
const EDITOR_LANGUAGE: Record<string, string> = {
	htmlEditor: "html",
	cssEditor: "css",
	jsEditor: "javascript",
	codeNodeEditor: "python",
	sqlEditor: "sql",
	jsonEditor: "json",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);

// n8n's option entries ({ name, value, description }) as ours ({ displayName, value }).
const normalizeOption = (entry: unknown): unknown => {
	if (!isRecord(entry)) return entry;
	// A category: its options, the same way.
	if ("categoryName" in entry) return Array.isArray(entry.options) ? { ...entry, options: entry.options.map(normalizeOption) } : entry;
	const { name, displayName, value, description: _description, action: _action, ...rest } = entry;
	return { ...rest, displayName: displayName ?? name, value: typeof value === "string" ? value : String(value) };
};

/**
 * A property as n8n writes it (`name`, `default`, `typeOptions`, `boolean`,
 * `number`, `string` with `password` / `editor` / `rows`, options of
 * `{ name, value }`) in this schema's terms — the old types (toggle, integer,
 * float, password, code…) stay as they are, so a manifest may use either.
 */
export const normalizeProperty = (raw: unknown): unknown => {
	if (!isRecord(raw)) return raw;
	const { default: fallback, typeOptions, noDataExpression: _noDataExpression, requiresDataPath: _requiresDataPath, ...rest } = raw;
	const property: Record<string, unknown> = { ...rest };
	if (fallback !== undefined && property.defaultValue === undefined) property.defaultValue = fallback;
	const options = isRecord(typeOptions) ? typeOptions : {};

	switch (property.type) {
		case "boolean":
			property.type = "toggle";
			break;
		case "number": {
			property.type = options.numberPrecision === 0 ? "integer" : "float";
			for (const key of ["minValue", "maxValue", "numberPrecision"] as const) {
				if (typeof options[key] === "number" && property[key] === undefined) property[key] = options[key];
			}
			// A number field holds its value as typed (it may be an expression).
			if (typeof property.defaultValue === "number") property.defaultValue = String(property.defaultValue);
			break;
		}
		case "string":
			if (options.password === true) property.type = "password";
			else if (typeof options.editor === "string") {
				property.type = "code";
				property.language ??= EDITOR_LANGUAGE[options.editor] ?? "plaintext";
			} else if (typeof options.rows === "number" && property.rows === undefined) property.rows = options.rows;
			break;
		case "json":
			if (typeof options.rows === "number" && property.rows === undefined) property.rows = options.rows;
			if (property.defaultValue !== undefined && typeof property.defaultValue !== "string") property.defaultValue = JSON.stringify(property.defaultValue);
			break;
		case "fixedCollection":
			if (typeof options.multipleValues === "boolean" && property.multipleValues === undefined) property.multipleValues = options.multipleValues;
			if (typeof options.sortable === "boolean" && property.sortable === undefined) property.sortable = options.sortable;
			// n8n's default "" for "no rows yet".
			if (property.defaultValue === "") delete property.defaultValue;
			break;
		case "filter": {
			const filter = isRecord(options.filter) ? options.filter : {};
			if (typeof filter.caseSensitive === "boolean" && property.caseSensitive === undefined) property.caseSensitive = filter.caseSensitive;
			if (isRecord(property.defaultValue) && Object.keys(property.defaultValue).length === 0) delete property.defaultValue;
			break;
		}
		case "assignmentCollection":
		case "collection":
			if (isRecord(property.defaultValue) && Object.keys(property.defaultValue).length === 0) delete property.defaultValue;
			break;
		case "notice":
			delete property.defaultValue;
			break;
	}

	if ((property.type === "options" || property.type === "multiOptions") && Array.isArray(property.options)) {
		property.options = property.options.map(normalizeOption);
		if (property.type === "options" && property.defaultValue !== undefined && typeof property.defaultValue !== "string") property.defaultValue = String(property.defaultValue);
	}

	return property;
};

const ConfigurationTypesSchema = zod.discriminatedUnion("type", [
	StringInputSchema,
	PasswordInputSchema,
	ToggleInputSchema,
	IntegerInputSchema,
	FloatInputSchema,
	ColorInputSchema,
	CodeInputSchema,
	OptionsSchema,
	PinOptionsSchema,
	AnySchema,
	BytesInputSchema,
	VariableInputSchema,
	FileInputSchema,
	CredentialInputSchema,
	ListInputSchema,
	ObjectInputSchema,
	DateTimeInputSchema,
	MultiOptionsSchema,
	JsonInputSchema,
	NoticeSchema,
	CollectionSchema,
	FixedCollectionSchema,
	FilterSchema,
	AssignmentCollectionSchema,
]);

/** A config as a manifest declares it — told apart by `type`; n8n's way of writing one is read too (normalizeProperty). */
export const ConfigurationSchema = zod.preprocess(normalizeProperty, ConfigurationTypesSchema);

/** Any config's value. */
export const ConfigurationValueSchema = zod
	.union([
		StringInputSchema.shape.defaultValue,
		PasswordInputSchema.shape.defaultValue,
		ToggleInputSchema.shape.defaultValue,
		IntegerInputSchema.shape.defaultValue,
		ColorInputSchema.shape.defaultValue,
		CodeInputSchema.shape.defaultValue,
		OptionsSchema.shape.defaultValue,
		PinOptionsSchema.shape.defaultValue,
		AnySchema.shape.defaultValue,
		BytesInputSchema.shape.defaultValue,
		VariableInputSchema.shape.defaultValue,
		FileValueSchema,
		CredentialValueSchema,
		// A list or an object config's value — its shape is checked against the
		// config's (validateShape), not here.
		zod.array(zod.unknown()),
		zod.record(zod.string(), zod.unknown()),
	])
	.optional();

/** A config bound to another action's config, by name. */
export type IBindingSchema = zod.infer<typeof BindingSchema>;
/** A config bound to an earlier action's output, by name. */
export type IOutputBindingSchema = zod.infer<typeof OutputBindingSchema>;
/** One choice of an options field. */
export type IOptionValueSchema = zod.infer<typeof OptionValueSchema>;
/** One entry of an options field: a choice, or a category of them. */
export type IOptionEntrySchema = zod.infer<typeof OptionEntrySchema>;
// The types an "any" value can be typed in as — see AnyValueKindSchema.
export type IAnyValueKindSchema = zod.infer<typeof AnyValueKindSchema>;
/** A value of an `any` field: its kind and the value. */
export type IAnyValueSchema = zod.infer<typeof AnyValueSchema>;
/** A config as a manifest declares it — told apart by `type`. */
export type IConfigurationSchema = zod.infer<typeof ConfigurationTypesSchema>;
/** One condition of a filter config. */
export type IFilterConditionSchema = zod.infer<typeof FilterConditionSchema>;
/** A filter config's value. */
export type IFilterValueSchema = zod.infer<typeof FilterValueSchema>;
/** One name / value pair of an assignmentCollection. */
export type IAssignmentSchema = zod.infer<typeof AssignmentSchema>;
/** An assignmentCollection's value. */
export type IAssignmentCollectionValueSchema = zod.infer<typeof AssignmentCollectionValueSchema>;
/** One group of a fixedCollection. */
export type IFixedCollectionGroupSchema = zod.infer<typeof FixedCollectionGroupSchema>;

/** The fields a collection or a fixedCollection's group holds — configs. */
export const nestedProperties = (holder: { options: unknown[] } | { values: unknown[] }): IConfigurationSchema[] =>
	("options" in holder ? holder.options : holder.values) as IConfigurationSchema[];

/** The key a nested field's value is kept under in its collection's value: its name, or its displayName. */
export const propertyKey = (property: Pick<IConfigurationSchema, "name" | "displayName">): string => property.name ?? property.displayName;
// One input filter of a string/password/integer/float config — see patterns/registry.ts
// for the names and what each checks:
//   - Email                                   a named filter
//   - { name: MaxLength, value: 16 }          a filter that takes a number
//   - { regex: "^[a-z]", message: "…" }       a custom regex (message optional)
export type IPatternSchema = zod.infer<typeof PatternSchema>;
/** A file to attach (an image, a certificate…) — it goes on the board with the session. */
export type IFileInputSchema = zod.infer<typeof FileInputSchema>;
/** An attached file, as a config holds it. */
export type IFileValueSchema = zod.infer<typeof FileValueSchema>;
// One of the user's credentials (see ICredentialType.schema.ts), of the type
// `credential` names — the WiFi network, an API token. The workflow holds
// only which one; the hosting puts its values on the board (/secrets) when a
// session starts, and the config carries their path there, as text.
export type ICredentialInputSchema = zod.infer<typeof CredentialInputSchema>;
/** A picked credential, as a config holds it — by id. */
export type ICredentialValueSchema = zod.infer<typeof CredentialValueSchema>;
