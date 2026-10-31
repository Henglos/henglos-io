import zod from "zod";
import { ActionSchema } from "./IAction.schema.js";
import { ConfigurationRuntime } from "./IConfiguration.runtime.js";
import { HandlerRuntime } from "./IHandler.runtime.js";

/**
 * A node of the workflow: one of its component's actions (or triggers), placed — its own id,
 * its configs' values, its handles and where it is on the canvas.
 */
export const ActionRuntime = zod.object({
	id: zod.string(),
	componentId: zod.string(),
	alias: zod.string(),
	base: ActionSchema,
	configurations: zod.array(ConfigurationRuntime),
	inputs: zod.array(HandlerRuntime),
	outputs: zod.array(HandlerRuntime),
	x: zod.number().optional(),
	y: zod.number().optional(),
	// Free-form note the user keeps on the node (studio "Notes" tab) — never
	// read by compile/execute.
	notes: zod.string().optional(),
	// Switched off in the studio (the eye): skipped when the flow runs — the
	// flow passes straight on to whatever its Success output leads to (see
	// withoutDisabledActions). Absent on actions that were never disabled.
	disabled: zod.boolean().optional(),
	// Advanced › Pass Context: whether it hands the next action what it was
	// handed too, not only its own outputs (see PassContext.use-case.ts).
	// Absent: its default — on for Logic and Variables, off for the rest.
	passContext: zod.boolean().optional(),
	// "trigger": the node of one of its component's `triggers` — starts a
	// branch on its own (see isTriggerAction). Absent on an action.
	kind: zod.literal("trigger").optional(),
});

/**
 * A node of the workflow: one of its component's actions (or triggers), placed — its own id,
 * its configs' values, its handles and where it is on the canvas.
 */
export type IActionRuntime = zod.infer<typeof ActionRuntime>;
