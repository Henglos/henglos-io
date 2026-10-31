import { TokenService } from "@/application/services/Token.service";
import { InvalidToken } from "@/application/errors/use-cases/Auth.error";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { Inject, Injectable } from "@nestjs/common";

/** How long a session lasts without being refreshed: 30 days. */
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Renews a user's session: a new access token, and a new refresh token in
 * place of the old one (rotation — each refresh token works once).
 */
@Injectable()
export class RefreshTokenUseCase {

	constructor(
		private readonly tokenService: TokenService,
		@Inject('IUserRepository')
		private readonly userRepository: IUserRepository,
	) {}

	/**
	 * @param rawRefreshToken The refresh token, as the studio has it.
	 * @throws InvalidToken when it isn't the user's current one, or it has expired.
	 */
	async execute(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {

		const hashedToken = this.tokenService.hashToken(rawRefreshToken);
		const user = await this.userRepository.findByRefreshToken(hashedToken);

		if (!user || !user.refreshTokenExpiresAt || user.refreshTokenExpiresAt < new Date()) {
			throw new InvalidToken();
		}

		const accessToken = this.tokenService.generate(user);
		const newRawToken = this.tokenService.generateRefreshToken();
		const newHashedToken = this.tokenService.hashToken(newRawToken);
		const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

		user.setRefreshToken(newHashedToken, newExpiresAt);
		await this.userRepository.update(user);

		return { accessToken, refreshToken: newRawToken };

	}

}
