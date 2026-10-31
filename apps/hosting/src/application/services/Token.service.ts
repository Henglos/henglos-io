import { MinimalUser } from '@/domain/entities/AuthUser';
import { User } from '@/domain/entities/User';
import { Email } from '@/domain/value-object/Email';
import * as json from 'jsonwebtoken';
import { ExpiredToken, InvalidToken } from '../errors/use-cases/Auth.error';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, randomBytes, createHash } from 'crypto';
import type { Env } from '@/config/env.schema';

/**
 * The users' tokens: a short-lived access token (a JWT, signed with
 * HIO_JWT_SECRET, lasting HIO_USER_JWT_EXPIRATION) and a random refresh token
 * to get a new one. Also the refresh-token generator and hash the drivers use.
 */
@Injectable()
export class TokenService {

	constructor(private readonly config: ConfigService<Env, true>) {}

	/** A new access token for the user. */
	generate(user: User): string {
		const payload: json.JwtPayload = {
			sub: user.id,
			jti: randomUUID(),

			email: user.email.getValue(),
		};

		const secret: string = this.config.get('HIO_JWT_SECRET', { infer: true });
		const options: json.SignOptions = {
			expiresIn: this.config.get('HIO_USER_JWT_EXPIRATION', { infer: true }) as json.SignOptions['expiresIn'],
			algorithm: 'HS256',
		};

		const token = json.sign(payload, secret, options);

		return token;
	}

	/** A new refresh token: 40 random bytes, as hex. In the clear — store its {@link hashToken}. */
	generateRefreshToken(): string {
		return randomBytes(40).toString('hex');
	}

	/** A token's SHA-256, as hex — what's stored instead of the token. */
	hashToken(token: string): string {
		return createHash('sha256').update(token).digest('hex');
	}

	/**
	 * Reads an access token.
	 *
	 * @returns The user it belongs to.
	 * @throws ExpiredToken when it has expired, InvalidToken when it isn't valid otherwise.
	 */
	verify(token: string): MinimalUser {

		try {

			const payload = json.verify(token, this.config.get('HIO_JWT_SECRET', { infer: true }), {
				algorithms: ['HS256'],
			});

			if (typeof(payload) === "string") throw new InvalidToken;
			if (!payload.sub) throw new InvalidToken;

			return new MinimalUser(payload.sub, Email.create(payload.email));

		} catch (e) {

			console.log(e)

			if (e instanceof json.TokenExpiredError) throw new ExpiredToken();
			throw new InvalidToken();

		}

	}
}
