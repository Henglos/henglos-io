import { BaseError } from "./BaseError";

/** No such project. */
export class ProjectNotFound extends BaseError {

	constructor() {
		super(404, "project_not_found");
	}

}
