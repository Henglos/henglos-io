import { BaseError } from "./Base.error.js";

/** No such package (or version) on the registry. */
export class PackageNotFound extends BaseError {

	constructor(pkgName: string) {
		super("package_not_found", `The package ${pkgName} not found.`)
	}

}
