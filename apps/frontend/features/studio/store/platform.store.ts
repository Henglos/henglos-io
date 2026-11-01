import { atom } from "jotai";
import { selectAtom } from "jotai/utils";
import { PROTOCOL_LIMIT_DEFAULTS, protocolLimits, type ProtocolLimits } from "@henglosio/workflow";
import type { PlatformSettings } from "@shared/api";
import { WorkflowAtom } from "./workflow.store";

// The board's limits for the open workflow — what the platform it's compiled
// with declares (its manifest's `settings` defaults), overridden by the
// workflow's own platformSettings. Anything in the studio that bounds a value
// by what the board accepts (bytes of a text, of a script, how many variables…)
// reads it from here, so it follows a limit as soon as it's changed in
// Platform settings.

/** The open workflow's platform version and what it declares — loaded by usePlatformSpec. Null until then. */
export const PlatformSpecAtom = atom<(PlatformSettings & { version: string }) | null>(null);

const EMPTY: Record<string, number> = {};

const sameRecord = (a: Record<string, number>, b: Record<string, number>) => {
	const keys = Object.keys(a);
	return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
};

// Just the two things the limits depend on, so editing a node (a new
// WorkflowAtom value) doesn't recompute them, nor re-render what reads them.
const OverridesAtom = selectAtom(WorkflowAtom, workflow => workflow?.data.platformSettings ?? EMPTY, sameRecord);
const PlatformVersionAtom = selectAtom(WorkflowAtom, workflow => workflow?.platform);

export type BoardLimits = {
	/** Every limit by key (MAX_VARIABLES, MAX_DATA_BUFFER, …) — the platform's default unless overridden. */
	values: Record<string, number>;
	/** The protocol limits, shaped for packet sizes (same as the host's codegen uses). */
	protocol: ProtocolLimits;
	/** Whether the platform's own defaults are in yet (until then: the protocol defaults only). */
	loaded: boolean;
};

export const BoardLimitsAtom = atom<BoardLimits>(get => {

	const overrides = get(OverridesAtom);
	const version = get(PlatformVersionAtom);
	const spec = get(PlatformSpecAtom);
	const loaded = !!spec && spec.version === version;

	const values: Record<string, number> = { ...PROTOCOL_LIMIT_DEFAULTS };
	if (loaded) for (const setting of spec.settings) values[setting.key] = setting.default;
	Object.assign(values, overrides);

	return { values, protocol: protocolLimits({ platformSettings: overrides }), loaded };

});
