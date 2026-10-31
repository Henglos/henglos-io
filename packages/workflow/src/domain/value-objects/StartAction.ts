import type { IActionSchema } from "../entities/IAction.schema.js";

/** Start — the node every workflow begins at, on boot. Its Mode runs its branch once or in a loop. */
export const StartActionSchema: IActionSchema = {

	displayName: "Start",
	description: "Entry point of the workflow — runs first; connect its output to the first action in the flow.",

	// Wire ACTION_ID computed as generateId("core/start") (see
	// computeWireActionId — "core" is resolveWorkflowAction's fixed componentName
	// for the virtual Start action) — must match
	// HIOFirmware::Drivers::Commands::Execute's m_startActionId
	// (HIOSDK::Util::generateId("core/start")).

	outputs: [
		{ id: "start", name: "Start" },
	],

	configurations: [
		{
			displayName: "Mode",
			description: "Whether the workflow keeps looping back to Start after finishing, or runs through once.",
			type: "options",
			defaultValue: "loop",
			options: [
				{ displayName: "Loop", value: "loop" },
				{ displayName: "Once", value: "once" },
			],
		},
	],

};
