import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DriverAuthService } from '@/application/services/DriverAuth.service';
import { TokenService } from '@/application/services/Token.service';
import { Driver } from '@/domain/entities/Driver';
import { DriverAuth } from '@/domain/entities/DriverAuth';

const ENV: Record<string, string> = {
	HIO_JWT_SECRET: 'test-secret',
	HIO_DRIVER_JWT_EXPIRATION: '30d',
};

const payloadOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());

describe('DriverAuthService', () => {
	let service: DriverAuthService;

	const driver = new Driver('driver-uuid', 'user-uuid', 'machine-123', 'henry', 'My Driver');

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				DriverAuthService,
				TokenService,
				{ provide: ConfigService, useValue: { get: (key: string) => ENV[key] } },
			],
		}).compile();

		service = module.get(DriverAuthService);
	});

	describe('generateToken()', () => {
		it('returns a three-part JWT string', async () => {
			const token = await service.generateToken(driver);
			expect(token.split('.')).toHaveLength(3);
		});

		it('says which driver and whose', async () => {
			const payload = payloadOf(await service.generateToken(driver));
			expect(payload).toMatchObject({ sub: driver.id, userId: driver.userId, deviceUser: driver.deviceUser, deviceName: driver.deviceName });
		});
	});

	describe('refreshToken()', () => {
		it('returns a new token for the same driver', async () => {
			const token = await service.generateToken(driver);
			const refreshed = service.refreshToken(token);
			expect(refreshed).not.toBe(token);
			expect(payloadOf(refreshed).sub).toBe(driver.id);
		});

		it('throws InvalidToken for a malformed or empty token', () => {
			expect(() => service.refreshToken('not-a-jwt')).toThrow('invalid_token');
			expect(() => service.refreshToken('')).toThrow('invalid_token');
		});
	});

	describe('verify()', () => {
		it('reads the driver from a valid token', async () => {
			const token = await service.generateToken(driver);
			expect(service.verify(token)).toEqual(new DriverAuth(driver.id!, driver.userId, driver.deviceUser, driver.deviceName));
		});

		it('throws InvalidToken for a malformed, empty or foreign token', async () => {
			expect(() => service.verify('bad-token')).toThrow('invalid_token');
			expect(() => service.verify('')).toThrow('invalid_token');

			const other = await Test.createTestingModule({
				providers: [
					DriverAuthService,
					TokenService,
					{ provide: ConfigService, useValue: { get: (key: string) => ({ ...ENV, HIO_JWT_SECRET: 'another-secret' })[key] } },
				],
			}).compile();
			const foreign = await other.get(DriverAuthService).generateToken(driver);
			expect(() => service.verify(foreign)).toThrow('invalid_token');
		});
	});

	describe('refresh tokens', () => {
		it('stores a hash, never the token', () => {
			const token = service.generateRefreshToken();
			const hash = service.hashRefreshToken(token);
			expect(hash).not.toBe(token);
			expect(service.hashRefreshToken(token)).toBe(hash);
		});
	});
});
