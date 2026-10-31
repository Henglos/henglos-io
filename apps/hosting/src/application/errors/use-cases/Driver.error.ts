import { BaseError } from "../BaseError";

/** That machine is already paired as a driver. */
export class DriverAlreadyExists extends BaseError {

	constructor() {
		super(400, "driver_already_exists");
	}

}

/** No such driver — or it isn't the user's. */
export class DriverNotFound extends BaseError {

	constructor() {
		super(404, "driver_not_found")
	}

}

/** A pair token that doesn't exist, or has expired. */
export class WrongPairToken extends BaseError {

	constructor() {
		super(400, "wrong_pair_token");
	}

}
