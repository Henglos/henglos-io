import { BaseError } from "../BaseError";

/** No release of the platform with that version. */
export class PlatformNotFound extends BaseError {
	constructor(version: string) {
		super(404, "platform_not_found", `Platform version "${version}" not found`);
	}
}
