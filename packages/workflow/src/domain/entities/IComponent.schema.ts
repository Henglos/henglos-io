import zod from "zod";
import { PinSchema } from "./IPin.schema.js";
import { ComponentActionSchema, ComponentTriggerSchema } from "./IAction.schema.js";
import { ConfigurationSchema } from "./IConfiguration.schema.js";
import { CredentialTypeSchema } from "./ICredentialType.schema.js";
import { CapabilitySchema } from "../value-objects/Capabilities.js";

// The fields, as a plain object — what CoreComponentSchema extends.
export const ComponentSchemaObject = zod.object({
	displayName: zod.string(),
	description: zod.string(),

	pins: PinSchema.optional(),

	// ComponentActionSchema (not the base ActionSchema) — a real component's
	// actions always ship as a MicroPython module, so `script` is required here.
	actions: zod.array(ComponentActionSchema).optional(),

	// What starts a branch of the flow on its own — see TriggerSchema. Same
	// namespace as the actions on the board ("<component>/<name>"), so a
	// trigger can't share a name with one of them.
	triggers: zod.array(ComponentTriggerSchema).optional(),

	// The kinds of credential its actions (or other packages') pick in a
	// `type: credential` config — see ICredentialType.schema.ts.
	credentials: zod.array(CredentialTypeSchema).optional(),

	// What every action and trigger of it needs of the board (its manifest's
	// dependences.capabilities) — wifi for HTTP. See Capabilities.use-case.ts.
	capabilities: zod.array(CapabilitySchema).optional(),
});

/**
 * A component as its manifest's `schema:` declares it: its actions, triggers, credential
 * types and capabilities — a trigger can't share a name with an action.
 */
export const ComponentSchema = ComponentSchemaObject.superRefine((component, ctx) => {
	const actions = new Set((component.actions ?? []).map(action => action.displayName.toLowerCase()));
	(component.triggers ?? []).forEach((trigger, index) => {
		if (actions.has(trigger.displayName.toLowerCase())) {
			ctx.addIssue({ code: "custom", path: ["triggers", index, "displayName"], message: `"${trigger.displayName}" is an action of this component too — a trigger needs a name of its own` });
		}
	});
});

/** A component as its manifest's `schema:` declares it. */
export type IComponentSchema = zod.infer<typeof ComponentSchema>;
