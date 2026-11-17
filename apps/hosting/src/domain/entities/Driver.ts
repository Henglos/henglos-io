import { RequiredDriver } from '@/application/errors/entities/Driver.error';

export type CreateDriverInput = {
	userId: string;

	deviceName: string;
	deviceUser: string;

	name?: string;
};

/**
 * A driver paired with a user's account — one computer (and one OS user on
 * it) that links the boards plugged into it to the hosting.
 */
export class Driver {

	/** How long a driver stays signed in without refreshing its session. */
	private static readonly REFRESH_TOKEN_TTL_DAYS = 30;

	constructor(
		public readonly id: string | undefined,
		public readonly userId: string,

		/** The machine's hostname. */
		public readonly deviceName: string,
		/** The OS user the driver runs as. */
		public readonly deviceUser: string,

		/** What it shows up as in the studio. */
		public name: string,

		/** The hash of its current refresh token — never the token itself. */
		public refreshToken: string | null = null,
		public refreshTokenExpiresAt: Date | null = null,
	) {}

	private static computeRefreshTokenExpiry(): Date {
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + Driver.REFRESH_TOKEN_TTL_DAYS);
		return expiresAt;
	}

	/**
	 * A newly paired driver, not saved yet. Named `<user>@<machine>` unless a
	 * name is given.
	 */
	public static create(input: CreateDriverInput): Driver {
		if (!input) throw new RequiredDriver();

		return new Driver(
			undefined,
			input.userId,
			input.deviceName,
			input.deviceUser,
			input.name ?? `${input.deviceUser}@${input.deviceName}`,
		);
	}

	/**
	 * Rotates the driver's refresh token. The expiry is always computed here
	 * (now + TTL) — the caller never picks it.
	 *
	 * @param hashedToken The new token's hash.
	 */
	public setRefreshToken(hashedToken: string): void {
		this.refreshToken = hashedToken;
		this.refreshTokenExpiresAt = Driver.computeRefreshTokenExpiry();
	}

	/** Signs the driver out: its refresh token no longer works. */
	public revokeRefreshToken(): void {
		this.refreshToken = null;
		this.refreshTokenExpiresAt = null;
	}

	/** Whether it has a refresh token, and it hasn't expired. */
	public isRefreshTokenValid(): boolean {
		if (!this.refreshToken || !this.refreshTokenExpiresAt) return false;
		return this.refreshTokenExpiresAt.getTime() > Date.now();
	}

	public updateName(name: string): void {
		this.name = name;
	}
}
