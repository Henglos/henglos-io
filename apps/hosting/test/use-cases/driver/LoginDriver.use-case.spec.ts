import { Test } from '@nestjs/testing';
import { LoginDriverWithTokenUseCase } from '@/application/use-cases/driver/LoginDriverWithToken.use-case';
import { DriverAuthService } from '@/application/services/DriverAuth.service';
import { Driver } from '@/domain/entities/Driver';
import { InvalidToken } from '@/application/errors/use-cases/Auth.error';

describe('LoginDriverUseCase', () => {
	let useCase: LoginDriverWithTokenUseCase;

	const mockDriverAuth = {
		authenticateToken: jest.fn(),
		refreshToken: jest.fn(),
	};

	const driver = new Driver('d-uuid', 'machine-1', 'user-1', 'My Driver', 'linux');

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				LoginDriverWithTokenUseCase,
				{ provide: DriverAuthService, useValue: mockDriverAuth },
			],
		}).compile();

		useCase = module.get(LoginDriverWithTokenUseCase);
		jest.clearAllMocks();
	});

	it('returns a refreshed token and the authenticated driver', async () => {
		mockDriverAuth.authenticateToken.mockResolvedValue(driver);
		mockDriverAuth.refreshToken.mockReturnValue('new-token');

		const result = await useCase.execute('old-token');

		expect(result.driver).toBe(driver);
		expect(result.token).toBe('new-token');
	});

	it('calls authenticateToken with the provided token', async () => {
		mockDriverAuth.authenticateToken.mockResolvedValue(driver);
		mockDriverAuth.refreshToken.mockReturnValue('new-token');

		await useCase.execute('my-token');

		expect(mockDriverAuth.authenticateToken).toHaveBeenCalledWith('my-token');
	});

	it('calls refreshToken with the original token', async () => {
		mockDriverAuth.authenticateToken.mockResolvedValue(driver);
		mockDriverAuth.refreshToken.mockReturnValue('new-token');

		await useCase.execute('my-token');

		expect(mockDriverAuth.refreshToken).toHaveBeenCalledWith('my-token');
	});

	it('propagates InvalidToken when the token is invalid', async () => {
		mockDriverAuth.authenticateToken.mockRejectedValue(new InvalidToken());

		await expect(useCase.execute('bad-token')).rejects.toThrow('invalid_token');
		expect(mockDriverAuth.refreshToken).not.toHaveBeenCalled();
	});
});
