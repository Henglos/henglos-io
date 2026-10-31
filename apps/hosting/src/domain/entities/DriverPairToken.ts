export type CreateDriverPairTokenInput = {
	userId: string;
	pairToken: string;
};

/**
 * A one-time token to pair a new driver with a user's account: the studio
 * creates it (Drivers), the user passes it to `hio driver login`. It works
 * for a few minutes, once.
 */
export class DriverPairToken {

	private static readonly TTL_MINUTES = 15;

	constructor(
		public readonly id: string | undefined,
		public readonly userId: string,
		/** The token, as the user passes it — stored as it is (it only lasts a few minutes). */
		public readonly token: string,
		public readonly expiresAt: Date,
		public readonly createdAt: Date,
	) {}

	private static computeExpiry(): Date {
		const expiresAt = new Date();
		expiresAt.setMinutes(expiresAt.getMinutes() + DriverPairToken.TTL_MINUTES);
		return expiresAt;
	}

	/**
	 * A new pair token, not saved yet. The expiry is always computed here
	 * (now + TTL) — the caller never picks it, as in Driver.setRefreshToken().
	 */
	public static create(input: CreateDriverPairTokenInput): DriverPairToken {
		return new DriverPairToken(
			undefined,
			input.userId,
			input.pairToken,
			DriverPairToken.computeExpiry(),
			new Date(),
		);
	}

	/** Whether `tokenHash` is this token. */
	public matches(tokenHash: string): boolean {
		return this.token === tokenHash;
	}

	public isExpired(): boolean {
		return this.expiresAt.getTime() <= Date.now();
	}

	public isValid(): boolean {
		return !this.isExpired();
	}
}
