
import zod from "zod";
import { isValidRegex, PARAM_PATTERN_NAMES, SIMPLE_PATTERN_NAMES } from "../../patterns/registry.js";
import { PinSchema } from "./IPin.schema.js";
import { KSchemaKindSchema, ShapeSchema } from "../schemas/ISchema.schema.js";

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

const BaseConfigurationSchema = zod.object({
	id: zod.number().optional(),

	displayName: zod.string().min(1),
	description: zod.string(),

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

// The types an "any" value can be typed in as — integer, float or bool (see
// SCALAR_KINDS).
export const AnyValueKindSchema = KSchemaKindSchema;

/** A value of an `any` field: its kind and the value. */
export const AnyValueSchema = zod.object({
	kind: AnyValueKindSchema,
	value: zod.union([zod.number(), zod.boolean()]),
}).strict();

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

/** A config as a manifest declares it — told apart by `type`. */
export const ConfigurationSchema = zod.discriminatedUnion("type", [
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
]);

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
// The types an "any" value can be typed in as — integer, float or bool (see
// SCALAR_KINDS).
export type IAnyValueKindSchema = zod.infer<typeof AnyValueKindSchema>;
/** A value of an `any` field: its kind and the value. */
export type IAnyValueSchema = zod.infer<typeof AnyValueSchema>;
/** A config as a manifest declares it — told apart by `type`. */
export type IConfigurationSchema = zod.infer<typeof ConfigurationSchema>;
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
