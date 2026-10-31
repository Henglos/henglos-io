import { v4 } from "uuid";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IActionSchema } from "../../../domain/entities/IAction.schema.js";
import type { IHandlerSchema } from "../../../domain/entities/IHandler.schema.js";
import { CreateConfiguration } from "../configurations/CreateConfiguration.js";

// A component whose schema doesn't declare inputs/outputs still needs a real,
// connectable handle — a chain has to reach past it — so one gets materialized
// here instead of only at render time: hosting's GenerateExecuteCommand/
// ResolveNextAction match connections against actual IActionRuntime.outputs
// entries, not against anything the canvas draws for looks. A frontend-only
// handle can never be wired into the recorded/executed graph, since there'd be
// nothing in the domain data for a connection's sourceHandle to match.
//
// Note there's no DEFAULT_FALLBACK here — every action can also fall through
// to HIOSDK::OutputId::FALLBACK (0xFFFF) regardless of what the component
// author declared, but that one is *derived* on read instead of persisted
// here (see getActionOutputs in ResolveNextAction.use-case.ts) so it applies
// uniformly to actions created before that existed too, with no data
// migration — every consumer that needs an action's real output list calls
// that function instead of reading .outputs directly.
const DEFAULT_INPUT: IHandlerSchema = { id: "default", name: "In" };
const DEFAULT_OUTPUT: IHandlerSchema = { id: "default", name: "Out" };

/** A new node from an action's (or a trigger's) schema: its configs, its inputs and outputs, a fresh id. */
export class CreateAction {
	private createConfiguration = new CreateConfiguration();

	/** `kind` "trigger": the node of a trigger (no input, only Out). */
	execute(base: IActionSchema, componentId: string, alias?: string, kind?: "trigger"): IActionRuntime {
		// A trigger starts its branch on its own: nothing leads into it.
		const trigger = kind === "trigger";
		const inputs = trigger ? [] : base.inputs && base.inputs.length > 0 ? base.inputs : [DEFAULT_INPUT];
		const outputs = !trigger && base.outputs && base.outputs.length > 0 ? base.outputs : [DEFAULT_OUTPUT];
		return {
			...(trigger && { kind }),
			id: v4(),
			componentId,
			alias: alias ?? base.displayName,
			base,
			configurations: (base.configurations ?? []).map(c => this.createConfiguration.execute(c)),
			inputs: inputs.map(h => ({ id: v4(), base: h })),
			outputs: outputs.map(h => ({ id: v4(), base: h })),
		};
	}
}
