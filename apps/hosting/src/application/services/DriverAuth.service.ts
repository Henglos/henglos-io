import * as json from 'jsonwebtoken';
import { Driver } from '@/domain/entities/Driver';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvalidToken } from '../errors/use-cases/Auth.error';
import { DriverAuth } from '@/domain/entities/DriverAuth';
import { randomUUID } from 'crypto';
import type { Env } from '@/config/env.schema';
import { TokenService } from './Token.service';

/**
 * The drivers' tokens: a short-lived access token (a JWT, signed with
 * HIO_JWT_SECRET, lasting HIO_DRIVER_JWT_EXPIRATION) that says which driver
 * it is, and a long-lived refresh token to get a new one.
 */
@Injectable()
export class DriverAuthService {

	constructor(
		private readonly config: ConfigService<Env, true>,
		private readonly tokenService: TokenService,
	) {}

	private get secret(): string {
		return this.config.get('HIO_JWT_SECRET', { infer: true });
	}

	private get expiration(): json.SignOptions['expiresIn'] {
		return this.config.get('HIO_DRIVER_JWT_EXPIRATION', { infer: true }) as json.SignOptions['expiresIn'];
	}

	/** A new access token for the driver. */
	public async generateToken(driver: Driver): Promise<string> {
		const payload: json.JwtPayload = {
			sub: driver.id,
			jti: randomUUID(),
			userId: driver.userId,
			deviceUser: driver.deviceUser,
			deviceName: driver.deviceName,
		};

		const token = json.sign(payload, this.secret, {
			expiresIn: this.expiration,
			algorithm: 'HS256',
		});

		return token;
	}

	/** A new refresh token, in the clear (not hashed) — the same generator users' tokens use, via TokenService. */
	public generateRefreshToken(): string {
		return this.tokenService.generateRefreshToken();
	}

	/** The refresh token's hash, to store — the token itself is never kept (as with User.refreshToken). */
	public hashRefreshToken(token: string): string {
		return this.tokenService.hashToken(token);
	}

	/**
	 * A new access token from an old one — expired or not, as long as this
	 * hosting signed it.
	 *
	 * @throws InvalidToken when it wasn't signed with this secret.
	 */
	public refreshToken(token: string): string {
		try {
			const payload = json.verify(token, this.secret, {
				algorithms: ['HS256'],
				ignoreExpiration: true,
			});
			if (typeof payload === 'string') throw new InvalidToken();

			const newToken = json.sign(
				{
					sub: payload.sub,
					jti: randomUUID(),

					userId: payload.userId,
					deviceUser: payload.deviceUser,
					deviceName: payload.deviceName,
				},
				this.secret,
				{
					expiresIn: this.expiration,
					algorithm: 'HS256',
				},
			);

			return newToken;

		} catch {
			throw new InvalidToken();
		}

	}

	/**
	 * Reads an access token.
	 *
	 * @returns The driver it belongs to.
	 * @throws InvalidToken when it isn't valid — badly signed, malformed or expired.
	 */
	public verify(token: string): DriverAuth {

		try {

			const payload = json.verify(token, this.secret, {
				algorithms: ['HS256'],
			});

			if (typeof(payload) === "string") throw new InvalidToken;
			if (!payload.sub) throw new InvalidToken;

			return new DriverAuth(payload.sub, payload.userId, payload.deviceUser, payload.deviceName);

		} catch {

			throw new InvalidToken();

		}

	}

}
