import { BaseError } from "../BaseError";

/** The registry has no SDK package. */
export class SdkNotFoundInRegistry extends BaseError {
	constructor() {
		super(404, "sdk_not_found_in_registry");
	}
}

/** The registry has no firmware package. */
export class FirmwareNotFoundInRegistry extends BaseError {
	constructor() {
		super(404, "firmware_not_found_in_registry");
	}
}

/** The registry has no package by that name (or version) — `info` names it. */
export class RegistryPackageNotFound extends BaseError {
	constructor(name: string) {
		super(404, "registry_package_not_found", name);
	}
}

/** The registry answered, but the package couldn't be downloaded. */
export class RegistryDownloadFailed extends BaseError {
	constructor() {
		super(502, "registry_download_failed");
	}
}
