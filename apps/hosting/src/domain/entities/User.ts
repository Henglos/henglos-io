import { RequiredUser } from '@/application/errors/entities/User.error';

import { Email } from '../value-object/Email';
import { Password } from '../value-object/Password';
import { Username } from '../value-object/Username';

type CreateUserInput = {

	email: string;
	username: string;
	password: string;

};

/**
 * A user account. Its email, username and password are value objects: they
 * can only hold valid values — every change goes through them.
 */
export class User {

	constructor(
		public readonly id: string | undefined,

		public email: Email,
		public username: Username,
		/** The password's hash. */
		public password: Password,

		public readonly createdAt: Date,
		public updatedAt: Date,

		/** The hash of the current refresh token — never the token itself. */
		public refreshToken: string | null = null,
		public refreshTokenExpiresAt: Date | null = null,
	) {}

	/**
	 * A new account, not saved yet: validates the email and the username, and
	 * hashes the password.
	 *
	 * @throws When one of them isn't valid.
	 */
	public static async create(input: CreateUserInput): Promise<User> {
		if (!input) {
			throw new RequiredUser;
		}

		const now = new Date();

		const email = Email.create(input.email);
		const username = Username.create(input.username);
		const password = await Password.create(input.password);

		return new User(
			undefined,
			email,
			username,
			password,
			now,
			now,
		);
	}

	/** Rotates the refresh token — or, with nulls, signs the user out. */
	public setRefreshToken(hashedToken: string | null, expiresAt: Date | null): void {
		this.refreshToken = hashedToken;
		this.refreshTokenExpiresAt = expiresAt;
		this.touch();
	}

	/** @param newPassword The new password, in the clear — it's hashed here. */
	public async changePassword(newPassword: string): Promise<void> {
		this.password = await Password.create(newPassword);
		this.touch();
	}

	public changeUsername(username: string): void {
		this.username = Username.create(username);
		this.touch();
	}

	public changeEmail(email: string): void {
		this.email = Email.create(email);
		this.touch();
	}

	private touch(): void {
		this.updatedAt = new Date();
	}

}
