import { Test } from '@nestjs/testing';
import { DriverAuthService } from '@/application/services/DriverAuth.service';
import { Driver } from '@/domain/entities/Driver';

describe('DriverAuthService', () => {
	let service: DriverAuthService;

	const mockDriverRepo = {
		findById: jest.fn(),
	};

	const driver = new Driver('driver-uuid', 'machine-123', 'user-uuid', 'My Driver', 'linux');

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				DriverAuthService,
				{ provide: 'IDriverRepository', useValue: mockDriverRepo },
			],
		}).compile();

		service = module.get(DriverAuthService);
		jest.clearAllMocks();
	});

	describe('generateToken()', () => {
		it('returns a three-part JWT string', async () => {
			const token = await service.generateToken(driver);
			expect(typeof token).toBe('string');
			expect(token.split('.')).toHaveLength(3);
		});

		it('encodes the driver id as the sub claim', async () => {
			const token = await service.generateToken(driver);
			const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
			expect(payload.sub).toBe(driver.id);
		});

		it('encodes the userId claim', async () => {
			const token = await service.generateToken(driver);
			const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
			expect(payload.userId).toBe(driver.userId);
		});
	});

	describe('refreshToken()', () => {
		it('returns a new token string different from the original', async () => {
			const token = await service.generateToken(driver);
			const refreshed = service.refreshToken(token);
			expect(typeof refreshed).toBe('string');
			expect(refreshed).not.toBe(token);
		});

		it('preserves the sub claim across refresh', async () => {
			const token = await service.generateToken(driver);
			const refreshed = service.refreshToken(token);
			const payload = JSON.parse(Buffer.from(refreshed.split('.')[1]!, 'base64url').toString());
			expect(payload.sub).toBe(driver.id);
		});

		it('throws InvalidToken for a completely invalid string', () => {
			expect(() => service.refreshToken('not-a-jwt')).toThrow('invalid_token');
		});

		it('throws InvalidToken for an empty string', () => {
			expect(() => service.refreshToken('')).toThrow('invalid_token');
		});
	});

	describe('authenticateToken()', () => {
		it('returns the driver from the repository for a valid token', async () => {
			mockDriverRepo.findById.mockResolvedValue(driver);
			const token = await service.generateToken(driver);

			const result = await service.authenticateToken(token);

			expect(mockDriverRepo.findById).toHaveBeenCalledWith(driver.id);
			expect(result).toBe(driver);
		});

		it('throws InvalidToken when the token is malformed', async () => {
			await expect(service.authenticateToken('bad-token')).rejects.toThrow('invalid_token');
		});

		it('throws InvalidToken when the driver is not found in the repository', async () => {
			mockDriverRepo.findById.mockResolvedValue(null);
			const token = await service.generateToken(driver);

			await expect(service.authenticateToken(token)).rejects.toThrow('invalid_token');
		});

		it('throws InvalidToken for an empty string', async () => {
			await expect(service.authenticateToken('')).rejects.toThrow('invalid_token');
		});
	});
});
