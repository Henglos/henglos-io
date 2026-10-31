import { Test } from '@nestjs/testing';
import { DeleteDriverUseCase } from '@/application/use-cases/driver/DeleteDriver.use-case';
import { DriverAuthService } from '@/application/services/DriverAuth.service';
import { Driver } from '@/domain/entities/Driver';
import { InvalidToken } from '@/application/errors/use-cases/Auth.error';

describe('DeleteDriverUseCase', () => {
	let useCase: DeleteDriverUseCase;

	const mockDriverAuth = { authenticateToken: jest.fn() };
	const mockDriverRepo = { delete: jest.fn() };

	const driver = new Driver('d-uuid', 'machine-1', 'user-1', 'My Driver', 'linux');

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				DeleteDriverUseCase,
				{ provide: DriverAuthService,    useValue: mockDriverAuth },
				{ provide: 'IDriverRepository', useValue: mockDriverRepo },
			],
		}).compile();

		useCase = module.get(DeleteDriverUseCase);
		jest.clearAllMocks();
	});

	it('authenticates the token and deletes the driver by id', async () => {
		mockDriverAuth.authenticateToken.mockResolvedValue(driver);
		mockDriverRepo.delete.mockResolvedValue(undefined);

		await useCase.execute('valid-token');

		expect(mockDriverAuth.authenticateToken).toHaveBeenCalledWith('valid-token');
		expect(mockDriverRepo.delete).toHaveBeenCalledWith(driver.id);
	});

	it('propagates InvalidToken and does not call delete when token is invalid', async () => {
		mockDriverAuth.authenticateToken.mockRejectedValue(new InvalidToken());

		await expect(useCase.execute('bad-token')).rejects.toThrow('invalid_token');
		expect(mockDriverRepo.delete).not.toHaveBeenCalled();
	});
});
