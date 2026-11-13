import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from '@/infrastructure/http/pipes/ZodValidation.pipe';
import { AUTH_RATE_LIMIT, REFRESH_RATE_LIMIT } from '@/infrastructure/http/guards/RateLimit.guard';
import { LoginUserUseCase } from '@/application/use-cases/auth/LoginUser.use-case';
import { RegisterUserUseCase } from '@/application/use-cases/auth/RegisterUser.use-case';
import { RefreshTokenUseCase } from '@/application/use-cases/auth/RefreshToken.use-case';
import { GetSetupStatusUseCase } from '@/application/use-cases/auth/GetSetupStatus.use-case';
import {
	RegisterUserInSchema,
	type RegisterUserIn,
	type RegisterUserOut,
	type LoginUserOut,
	RefreshTokenInSchema,
	type RefreshTokenIn,
	type RefreshTokenOut,
	type SetupStatusOut,
} from '@henglosio/shared';

/** /io/api/v1/auth — setting the installation up, signing in, keeping the session. No token needed. */
@Controller('/auth')
export class AuthController {
	constructor(
		private readonly loginUseCase: LoginUserUseCase,
		private readonly registerUseCase: RegisterUserUseCase,
		private readonly refreshTokenUseCase: RefreshTokenUseCase,
		private readonly getSetupStatusUseCase: GetSetupStatusUseCase,
	) {}

	/** GET /auth/setup-status — whether the installation has its user yet (also the Docker healthcheck). */
	@Get('/setup-status')
	async setupStatus(): Promise<SetupStatusOut> {
		return this.getSetupStatusUseCase.execute();
	}

	/** POST /auth/register — creates the installation's user (once). */
	@Post('/register')
	@Throttle({ default: AUTH_RATE_LIMIT })
	async register(
		@Body(new ZodValidationPipe(RegisterUserInSchema)) body: RegisterUserIn,
	): Promise<RegisterUserOut> {
		await this.registerUseCase.execute(
			body.email,
			body.username,
			body.password,
		);
		return { status: 'ok' };
	}

	/**
	 * POST /auth/login/:provider — signs in with a strategy ("local": `{ email, password }`).
	 * Answers an access token and a refresh token.
	 */
	@Post('/login/:provider')
	@Throttle({ default: AUTH_RATE_LIMIT })
	async login(
		@Param('provider') provider: string,
		@Body() body: any,
	): Promise<LoginUserOut> {
		return this.loginUseCase.execute(provider, body);
	}

	/** POST /auth/refresh — a new access token (and refresh token) from the refresh token. */
	@Post('/refresh')
	@Throttle({ default: REFRESH_RATE_LIMIT })
	async refresh(
		@Body(new ZodValidationPipe(RefreshTokenInSchema)) body: RefreshTokenIn,
	): Promise<RefreshTokenOut> {
		return this.refreshTokenUseCase.execute(body.refreshToken);
	}
}
