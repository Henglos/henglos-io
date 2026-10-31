import { User } from "../entities/User";

/**
 * A way to sign in — email and password today (LocalAuthStrategy). Each one
 * registers under its `type`, and AuthService picks it by that name.
 */
export interface IAuthStrategy {

	/** Its name, e.g. "local". */
	type: string;

	/**
	 * Checks what was sent to sign in.
	 *
	 * @param input What the strategy expects (for "local", an email and a password).
	 * @returns The user it belongs to.
	 * @throws When it doesn't belong to anyone.
	 */
	authenticate(input: unknown): Promise<User>;

}
