import { BaseError } from "../BaseError";

/** A package that couldn't be read from its registry. */
export class CannotLoadPackage extends BaseError {

	constructor() {
		super(400, "cannot_load_package");
	}

}

/** The package is already linked to the workflow. */
export class PackageAlreadyLinked extends BaseError {

	constructor() {
		super(400, "package_already_linked");
	}

}

/** No such package — or not in the user's library. */
export class PackageNotFound extends BaseError {

	constructor() {
		super(404, "package_not_found");
	}

}

/** The package has no manifest.yaml at its root. */
export class ManifestNotFound extends BaseError {

	constructor() {
		super(404, "manifest_not_found");
	}

}

/** Its board or component schema doesn't validate. */
export class InvalidPackageSchema extends BaseError {

	constructor() {
		super(400, "invalid_package_schema")
	}

}

/** It's not a board or a component (a platform, a project…). */
export class InvalidPackageType extends BaseError {

	constructor() {
		super(400, "invalid_package_type");
	}

}

/** The user already has that package version in their library. */
export class PackageAlreadyExists extends BaseError {

	constructor() {
		super(400, "package_already_exists");
	}

}

/** A workflow still uses it — it can't be removed. */
export class PackageInUse extends BaseError {

	constructor() {
		super(409, "package_in_use");
	}

}

/** The package doesn't work with the workflow's platform version. */
export class IncompatiblePlatformVersion extends BaseError {

	constructor() {
		super(400, "incompatible_platform_version");
	}

}
