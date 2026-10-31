import { Test } from '@nestjs/testing';
import { ListDriversByUserUseCase } from '@/application/use-cases/driver/ListDriversByUser.use-case';
import { DriverAuthService } from '@/application/services/DriverAuth.service';
import { Driver } from '@/domain/entities/Driver';
import { InvalidToken } from '@/application/errors/use-cases/Auth.error';

describe('ListDriversByUserUseCase', () => {
	let useCase: ListDriversByUserUseCase;

	const mockDriverAuth = { authenticateToken: jest.fn() };
	const mockDriverRepo = { findAllByUser: jest.fn() };

	const driver1 = new Driver('d1', 'mac-1', 'user-1', 'Driver One',   'linux');
	const driver2 = new Driver('d2', 'mac-2', 'user-1', 'Driver Two',   'windows');
	const driver3 = new Driver('d3', 'mac-3', 'user-2', 'Other Driver', 'macos');

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				ListDriversByUserUseCase,
				{ provide: DriverAuthService,    useValue: mockDriverAuth },
				{ provide: 'IDriverRepository', useValue: mockDriverRepo },
			],
		}).compile();

		useCase = module.get(ListDriversByUserUseCase);
		jest.clearAllMocks();
	});

	it('returns all drivers belonging to the authenticated user', async () => {
		mockDriverAuth.authenticateToken.mockResolvedValue(driver1);
		mockDriverRepo.findAllByUser.mockResolvedValue([driver1, driver2]);

		const result = await useCase.execute('valid-token');

		expect(result).toHaveLength(2);
		expect(result).toContain(driver1);
		expect(result).toContain(driver2);
		expect(result).not.toContain(driver3);
	});

	it('calls findAllByUser with the userId from the authenticated driver', async () => {
		mockDriverAuth.authenticateToken.mockResolvedValue(driver1);
		mockDriverRepo.findAllByUser.mockResolvedValue([driver1]);

		await useCase.execute('valid-token');

		expect(mockDriverRepo.findAllByUser).toHaveBeenCalledWith('user-1');
	});

	it('returns an empty array when the user has no drivers', async () => {
		mockDriverAuth.authenticateToken.mockResolvedValue(driver1);
		mockDriverRepo.findAllByUser.mockResolvedValue([]);

		const result = await useCase.execute('valid-token');

		expect(result).toEqual([]);
	});

	it('propagates InvalidToken when the token is invalid', async () => {
		mockDriverAuth.authenticateToken.mockRejectedValue(new InvalidToken());

		await expect(useCase.execute('bad-token')).rejects.toThrow('invalid_token');
		expect(mockDriverRepo.findAllByUser).not.toHaveBeenCalled();
	});
});
