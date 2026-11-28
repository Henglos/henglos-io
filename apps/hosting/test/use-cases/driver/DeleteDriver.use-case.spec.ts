import { Test } from '@nestjs/testing';
import { DeleteDriverUseCase } from '@/application/use-cases/driver/DeleteDriver.use-case';
import { Driver } from '@/domain/entities/Driver';

describe('DeleteDriverUseCase', () => {
	let useCase: DeleteDriverUseCase;

	const mockDriverRepo = { findById: jest.fn(), delete: jest.fn() };

	const driver = new Driver('d-uuid', 'user-1', 'machine-1', 'henry', 'My Driver');

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				DeleteDriverUseCase,
				{ provide: 'IDriverRepository', useValue: mockDriverRepo },
			],
		}).compile();

		useCase = module.get(DeleteDriverUseCase);
		jest.clearAllMocks();
	});

	it("deletes the user's driver", async () => {
		mockDriverRepo.findById.mockResolvedValue(driver);

		await useCase.execute('user-1', 'd-uuid');

		expect(mockDriverRepo.delete).toHaveBeenCalledWith('d-uuid');
	});

	it('throws DriverNotFound when there is no such driver', async () => {
		mockDriverRepo.findById.mockResolvedValue(null);

		await expect(useCase.execute('user-1', 'missing')).rejects.toThrow('driver_not_found');
		expect(mockDriverRepo.delete).not.toHaveBeenCalled();
	});

	it("throws DriverNotFound for another user's driver", async () => {
		mockDriverRepo.findById.mockResolvedValue(driver);

		await expect(useCase.execute('user-2', 'd-uuid')).rejects.toThrow('driver_not_found');
		expect(mockDriverRepo.delete).not.toHaveBeenCalled();
	});
});
