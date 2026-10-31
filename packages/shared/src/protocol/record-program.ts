import { GenerateExecuteCommand, RECORD_COMMAND_ID, ResolveRecordSequence, withoutDisabledActions, type IWorkflowRuntime } from "@henglosio/workflow";
import { buildEmptyPayload, buildRequestFrame, CommandId } from "./packet.js";

const generateExecuteCommand = new GenerateExecuteCommand();
const resolveRecordSequence = new ResolveRecordSequence();

/**
 * Compiles a workflow into the full REQUEST frame sequence a device needs to
 * record it: EraseRecord (wipe whatever's stored before this one) + one
 * Record-flavoured Execute frame per action reachable from Start, in graph
 * order + FinishRecord (flush the buffer to storage).
 *
 * Lives here rather than in @henglosio/workflow because it also needs the
 * wire-frame envelope (buildRequestFrame/buildEmptyPayload/CommandId) from
 * this package's protocol layer, and @henglosio/workflow can't depend back
 * on @henglosio/shared (this package already depends on it, for the runtime
 * types record-order resolution walks).
 *
 * Disabled actions aren't recorded: the program is built from the workflow
 * as it runs (withoutDisabledActions), the flow passing straight through them.
 */
export function buildRecordProgram(stored: IWorkflowRuntime): Uint8Array<ArrayBuffer>[] {

	const workflow = withoutDisabledActions(stored);
	const sequence = resolveRecordSequence.execute(workflow);
	if (sequence.length === 0) return [];

	const frames: Uint8Array<ArrayBuffer>[] = [];

	frames.push(buildRequestFrame(buildEmptyPayload(CommandId.ERASE_RECORD)));

	for (const actionId of sequence) {
		const payload = generateExecuteCommand.execute(workflow, actionId, RECORD_COMMAND_ID);
		if (!payload) continue;
		frames.push(buildRequestFrame(payload));
	}

	frames.push(buildRequestFrame(buildEmptyPayload(CommandId.FINISH_RECORD)));

	return frames;

}
