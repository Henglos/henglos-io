import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";

/** A config computed by a Code script. */
export class SetConfigurationCode {
	// Doesn't touch `value` on purpose, mirroring SetConfigurationOutputBinding —
	// only UpdateConfigurationValue clears the opposite field (`binding`), since
	// setting a literal is the one action that's actually incompatible with
	// whichever binding was there before.
	execute(state: IConfigurationRuntime, code: string): IConfigurationRuntime {
		return { ...state, binding: { code } };
	}
}
