import { InvalidEmail, RequiredEmail } from "@/application/errors/value-object/Email.error";

/** An email address — always valid, trimmed and lowercased. Immutable. */
export class Email {

	private readonly value: string;

	// RFC 2822
	private static readonly EMAIL_REGEX = /^([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22))*\x40([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d))*$/;

	private constructor(value: string) {
		this.value = value;
		Object.freeze(this);
	}

	/**
	 * @throws RequiredEmail when it's empty, InvalidEmail when it isn't an email address.
	 */
	public static create(email: string): Email {
		if (!email) {
			throw new RequiredEmail;
		}

		// "Ana@Mail.com " and "ana@mail.com" are the same address.
		const normalized = email.trim().toLowerCase();

		if (!Email.EMAIL_REGEX.test(normalized)) {
			throw new InvalidEmail;
		}

		return new Email(normalized);
	}

	public getValue(): string {
		return this.value;
	}

	public equals(other: Email): boolean {
		if (!other) return false;
		return this.value === other.value;
	}

	public toString(): string {
		return this.value;
	}

}
