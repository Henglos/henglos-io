import { AuthService } from "@/application/services/Auth.service";
import { TokenService } from "@/application/services/Token.service";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { Inject, Injectable } from "@nestjs/common";

/** How long a sign-in lasts without being refreshed: 30 days. */
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Signs a user in: checks what they sent (through the strategy `type`) and
 * starts a session — an access token, and a refresh token to renew it. Only
 * the refresh token's hash is stored, so signing in again ends the previous
 * session.
 */
@Injectable()
export class LoginUserUseCase {

	constructor(
		private readonly authService: AuthService,
		private readonly tokenService: TokenService,
		@Inject('IUserRepository')
		private readonly userRepository: IUserRepository,
	) {}

	/**
	 * @param type The sign-in strategy, e.g. "local".
	 * @param input What it expects (for "local", an email and a password).
	 * @throws The strategy's error when it doesn't match an account.
	 */
	async execute(type: string, input: unknown): Promise<{ accessToken: string; refreshToken: string }> {

		const user = await this.authService.authenticate(type, input);

		const accessToken = this.tokenService.generate(user);
		const rawRefreshToken = this.tokenService.generateRefreshToken();
		const hashedRefreshToken = this.tokenService.hashToken(rawRefreshToken);
		const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

		user.setRefreshToken(hashedRefreshToken, expiresAt);
		await this.userRepository.update(user);

		return { accessToken, refreshToken: rawRefreshToken };

	}

}
