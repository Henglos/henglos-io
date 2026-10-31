import { BaseError } from "./Base.error.js";

/** Another task holds what this one needs — the board's port, or the workflow's build. */
export class ResourceBusy extends BaseError {

	constructor(key: string) {
		const hint = key.startsWith("port:") ? " See what it is in the board indicator, in the middle of the top bar." : "";
		super("resource_busy", `Resource ${key} is busy with another operation.${hint}`)
	}

}
