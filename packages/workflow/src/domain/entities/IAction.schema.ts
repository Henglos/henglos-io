import zod from "zod";
import { HandlerSchema } from "./IHandler.schema.js";
import { ConfigurationSchema } from "./IConfiguration.schema.js";
import { KSchemaSchema } from "../schemas/ISchema.schema.js";
import { CapabilitySchema } from "../value-objects/Capabilities.js";

/** An action as a component's manifest declares it: its name, configs, outputs and script. */
export const ActionSchema = zod.object({
	displayName: zod.string(),
	description: zod.string(),

	// A Lucide icon for its node and the pickers, by its name on lucide.dev —
	// "wifi", "thermometer-sun" (PascalCase, "ThermometerSun", works too). An
	// unknown name, or none, shows the default.
	icon: zod.string().optional(),

	// What it needs of the board on top of its component's capabilities —
	// one action of a component that otherwise doesn't (see Capabilities.use-case.ts).
	capabilities: zod.array(CapabilitySchema).optional(),

	outputSchema: KSchemaSchema.array().optional(),

	inputs: zod.array(HandlerSchema).optional(),
	outputs: zod.array(HandlerSchema).optional(),

	// Outputs that come from a fixedCollection's rows — one per row, before the
	// fixed `outputs` (a Switch's rules, then its Default): "<idPrefix>_<n>",
	// named by the row's `labelField` when it's set, "<namePrefix> <n>" when
	// not. They follow the rows as the config changes (DynamicOutputs.ts).
	dynamicOutputs: zod.object({
		// The fixedCollection, by its name (or displayName).
		property: zod.string().min(1),
		// The group of it whose rows are outputs.
		group: zod.string().min(1),
		labelField: zod.string().optional(),
		idPrefix: zod.string().regex(/^[a-z][a-z0-9]*$/).default("output"),
		namePrefix: zod.string().default("Output"),
	}).optional(),

	configurations: zod.array(ConfigurationSchema).optional(),

	// Path (relative to the component package's root) to this
	// action's MicroPython source, e.g. "python/write.py". Optional here only
	// because this base schema is also reused for the workflow's synthetic
	// Start action (see StartAction.ts) and board-level runtime actions,
	// neither of which ships as a real script-backed component — see ComponentActionSchema
	// below, which is what actually enforces this for real components.
	script: zod.string().optional(),
});

/** An action as a component's manifest declares it: its name, configs, outputs and script. */
export type IActionSchema = zod.infer<typeof ActionSchema>;

// A trigger (a component's `triggers:`): a node that starts a branch of the
// flow on its own (a timer, a pin changing, a request coming in), the way
// Start does at boot. An action without handles of its own — no input, and
// only the Out output: it fires or it doesn't (see isTriggerAction).
export const TriggerSchema = ActionSchema.omit({ inputs: true, outputs: true });

// What a real component's actions must satisfy (see IComponent.schema.ts) —
// `script` becomes required: a real component always ships as a MicroPython
// module (path relative to the component package's root), and
// NOT derived from displayName by convention — displayName is user-facing UI
// text (already renamable independently of the wire ACTION_ID's own
// displayName-derived hash), so a file lookup keyed off it would silently
// break on rename. Explicit here at least keeps the file resolvable even when
// the ACTION_ID itself still shifts on rename (see computeWireActionId).
export const ComponentActionSchema = ActionSchema.extend({
	script: zod.string(),
});

// The same for a real component's triggers: their MicroPython module is required.
export const ComponentTriggerSchema = TriggerSchema.extend({
	script: zod.string(),
});
