import { InvalidUsername, RequiredUsername } from "../../application/errors/value-object/Username.errors";

/**
 * A username — always valid: 3 to 30 letters, digits and single spaces,
 * trimmed. Immutable.
 */
export class Username {
	private readonly value: string;

	// Letters (A-Z, a-z), digits and spaces.
	private static readonly USERNAME_REGEX = /^[A-Za-z0-9 ]+$/;

	private constructor(value: string) {
		this.value = value;
		Object.freeze(this);
	}

	/**
	 * @throws RequiredUsername when it's empty, InvalidUsername when it doesn't meet the rules.
	 */
	public static create(input: string): Username {
		if (!input) throw new RequiredUsername;

		// "  Ana   Maria " → "Ana Maria".
		const normalized = input.trim().replace(/\s+/g, ' ');

		if (normalized.length < 3) {
			throw new InvalidUsername;
		}

		if (normalized.length > 30) {
			throw new InvalidUsername;
		}

		if (!Username.USERNAME_REGEX.test(normalized)) {
			throw new InvalidUsername;
		}

		return new Username(normalized);
	}

	public getValue(): string {
		return this.value;
	}

	public equals(other: Username): boolean {
		if (!other) return false;
		return this.value === other.value;
	}

	public toString(): string {
		return this.value;
	}
}
