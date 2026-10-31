import { BaseError } from "./BaseError";

/** No such driver — or it isn't the user's. */
export class DriverNotFound extends BaseError {

	constructor() {
		super(404, "driver_not_found")
	}

}


/** The driver isn't connected to the hosting right now. */
export class DriverOffline extends BaseError {

	constructor() {
		super(400, "driver_offline");
	}

}

/** The driver got the command but couldn't carry it out. */
export class DriverError extends BaseError {

	constructor() {
		super(400, "driver_error");
	}

}
