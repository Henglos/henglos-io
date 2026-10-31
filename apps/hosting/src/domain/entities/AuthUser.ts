import { Email } from "../value-object/Email";

/**
 * The signed-in user, as a request knows it: who they are, from their access
 * token — without loading the whole user.
 */
export class MinimalUser {

	constructor(
		public readonly userId: string,
		public readonly email: Email,
	) {}

}
