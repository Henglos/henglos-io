import type { IWorkflowRuntime } from "../entities/IWorkflow.runtime.js";

// Firmware ceilings (PacketCodec.py). Past any of them the board drops the
// whole EXECUTE (or silently loses entries), so they're checked here, where
// the error can say which config is at fault. A workflow can override them
// (workflow.platformSettings — the platform's build compiles the same values
// into the board), so they're read per workflow with protocolLimits().
// Duplicated rather than imported: shared depends on this package, not the
// other way around. The studio reads them reactively through BoardLimitsAtom.
// Platform 2.7.0's defaults: packets of 1 KB and values of 512 B — room for a
// list or an object (their JSON). Older runtimes (256 / 64) need a Compile /
// Flash to take these.
export const PROTOCOL_LIMIT_DEFAULTS = {
	MAX_PACKET_SIZE: 1024,
	MAX_DATA_BUFFER: 512,
	MAX_CODE_BUFFER: 192,
	MAX_CONFIGS_PER_COMMAND: 15,
	MAX_OUTPUTS_PER_ACTION: 4,
} as const;

// The defaults — kept for callers that don't have a workflow at hand.
export const MAX_DATA_BUFFER = PROTOCOL_LIMIT_DEFAULTS.MAX_DATA_BUFFER;
/** The default most bytes of one CODE config's source. */
export const MAX_CODE_BUFFER = PROTOCOL_LIMIT_DEFAULTS.MAX_CODE_BUFFER;

/** The protocol limits a board runs with — the platform's, or the workflow's overrides. */
export type ProtocolLimits = {
	/** Bytes of PAYLOAD one frame carries: MAX_PACKET_SIZE minus FRAME_TYPE + FRAME_ID and CRC16. */
	maxPayload: number;
	maxData: number;
	maxCode: number;
	maxConfigs: number;
	maxOutputs: number;
};

/** The protocol limits the board runs `workflow` with — the platform's defaults, overridden by its platformSettings. */
export function protocolLimits(workflow: Pick<IWorkflowRuntime, "platformSettings">): ProtocolLimits {
	const value = (key: keyof typeof PROTOCOL_LIMIT_DEFAULTS) => workflow.platformSettings?.[key] ?? PROTOCOL_LIMIT_DEFAULTS[key];
	return {
		maxPayload: value("MAX_PACKET_SIZE") - 3 - 2,
		maxData: value("MAX_DATA_BUFFER"),
		maxCode: value("MAX_CODE_BUFFER"),
		maxConfigs: value("MAX_CONFIGS_PER_COMMAND"),
		maxOutputs: value("MAX_OUTPUTS_PER_ACTION"),
	};
}
