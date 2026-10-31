import { InvalidPassword, RequiredPassword } from '@/application/errors/value-object/Password.error';
import * as argon2 from 'argon2';

/**
 * A password, as its argon2id hash — the password itself is never kept.
 * Immutable.
 */
export class Password {

	private readonly hash: string;

	/** 8 to 35 characters, with at least one capital letter and one digit. */
	private static readonly PASSWORD_REGEX =
		/^(?=.*[A-Z])(?=.*\d).{8,35}$/;

	/** @param hash A stored hash — to hash a new password, use {@link Password.create}. */
	constructor(hash: string) {
		this.hash = hash;
		Object.freeze(this);
	}

	/**
	 * Validates a new password and hashes it.
	 *
	 * @throws RequiredPassword when it's empty, InvalidPassword when it doesn't meet the rules.
	 */
	public static async create(plain: string): Promise<Password> {

		Password.validate(plain);

		const hash = await argon2.hash(plain, {
			type: argon2.argon2id,
			memoryCost: 2 ** 16,
			timeCost: 3,
			parallelism: 1,
		});

		return new Password(hash);
	}

	/** Whether `plain` is the password `hashed` was made from. */
	public static async verify(
		plain: string,
		hashed: Password,
	): Promise<boolean> {
		return argon2.verify(hashed.hash, plain);
	}

	/** The hash. */
	public getValue(): string {
		return this.hash;
	}

	/**
	 * Checks a password against the rules: not empty, no spaces, 8 to 35
	 * characters with a capital letter and a digit.
	 *
	 * @throws RequiredPassword or InvalidPassword.
	 */
	public static validate(plain: string): void {
		if (!plain) {
			throw new RequiredPassword;
		}

		if (plain.includes(' ')) {
			throw new InvalidPassword;
		}

		if (!Password.PASSWORD_REGEX.test(plain)) {
			throw new InvalidPassword;
		}

	}

}
