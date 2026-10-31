import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IHandlerRuntime } from "../../../domain/entities/IHandler.runtime.js";
import { generateId } from "../../../utils/identifier.js";
import { resolveWorkflowAction } from "./ResolveWorkflowAction.js";

/** The OUTPUT_ID an action ends on when it succeeds — its default output. */
export const SUCCESS_OUTPUT_ID = 0x0000;
/** The OUTPUT_ID an action ends on when it fails. */
export const FALLBACK_OUTPUT_ID = 0xffff;
/** The Fallback output's handle id. */
export const FALLBACK_HANDLE_NAME = "fallback";

// Every action can fall through to HIOSDK::OutputId::FALLBACK (0xFFFF) on the
// firmware side regardless of what component.schema.yaml declares (see every
// IAction::execute() — none of them declare "fallback" as a schema output
// either). Rather than requiring it to be persisted in every IActionRuntime.outputs
// (which would need a data migration for every action created before this
// existed), it's derived here on read — every consumer that needs an action's
// real output list (rendering, wire id resolution, command generation) should
// call this instead of touching action.outputs directly. The id is
// deterministic (action.id + a fixed suffix), not a fresh v4() per call — it
// has to stay stable across repeated calls/reloads so a connection wired to it
// keeps matching, and idempotent against action.outputs already having one
// (e.g. an older in-memory copy) rather than ever producing two.
//
// A trigger has no Fallback: it fires or it doesn't (see isTriggerAction).
export function getActionOutputs(action: IActionRuntime): IHandlerRuntime[] {
	const real = action.outputs.filter(output => output.base.id !== FALLBACK_HANDLE_NAME);
	if (action.kind === "trigger") return real;
	const fallback: IHandlerRuntime = {
		id: `${action.id}-fallback`,
		base: { id: FALLBACK_HANDLE_NAME, name: "Fallback" },
	};
	return [...real, fallback];
}

// Mirrors the ACTION_ID/CONFIG_ID hashing convention (see docs/protocol.md): a
// handle literally named "fallback" is always the FALLBACK sentinel (0xFFFF).
// Past that, an action's sole REAL (non-fallback) output is always SUCCESS
// (0x0000); with multiple, every other handle is generateId(handleId) — same
// scheme CONFIG_ID uses. Counting getActionOutputs(action) minus the fallback
// entry (not action.outputs.length) is what keeps non-branching actions (GPIO
// Write, Delay, Servo... — which no longer declare `outputs:` at all, so they
// get a single generic "Out" handle from CreateAction) resolving to 0x0000 like
// their C++ execute() already returns, now that every action effectively has a
// second (fallback) output.
export function computeWireOutputId(action: IActionRuntime, handleBaseId: string): number {
	if (handleBaseId === FALLBACK_HANDLE_NAME) return FALLBACK_OUTPUT_ID;
	const realOutputs = getActionOutputs(action).filter(output => output.base.id !== FALLBACK_HANDLE_NAME);
	if (realOutputs.length <= 1) return SUCCESS_OUTPUT_ID;
	return generateId(handleBaseId);
}

// No on-device graph storage exists (see docs/design-decisions.md) — the host walks
// the workflow's connections itself, one Execute/RESPONSE round-trip at a time.
// Given the action that just ran and the outputId the firmware returned in its
// RESPONSE, finds the id of the next action to Execute.
export class ResolveNextAction {

	execute(workflow: IWorkflowRuntime, currentActionId: string, outputId: number): string | undefined {

		const resolved = resolveWorkflowAction(workflow, currentActionId);
		if (!resolved) return undefined;

		const matchingOutput = getActionOutputs(resolved.action).find(
			output => computeWireOutputId(resolved.action, output.base.id) === outputId,
		);
		if (!matchingOutput) return undefined;

		// A handle can have more than one recorded connection — e.g. a dangling
		// one left over from a deleted action that was never pruned (see
		// RemoveActionFromWorkflowComponent) sitting alongside the real, current
		// one. Try each candidate in order and use the first whose target still
		// resolves to a real action, instead of giving up on the first (possibly
		// stale) match.
		const candidates = workflow.connections.filter(
			c => c.source === currentActionId && c.sourceHandle === matchingOutput.id,
		);

		return candidates.find(c => resolveWorkflowAction(workflow, c.target) !== undefined)?.target;

	}

}
