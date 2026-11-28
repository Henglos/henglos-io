import { Test } from '@nestjs/testing';
import { ListDriversByUserUseCase } from '@/application/use-cases/driver/ListDriversByUser.use-case';
import { DriverConnectionRegistry } from '@/application/services/DriverConnectionRegistry.service';
import { Driver } from '@/domain/entities/Driver';

describe('ListDriversByUserUseCase', () => {
	let useCase: ListDriversByUserUseCase;

	const mockDriverRepo = { findAllByUser: jest.fn() };
	const mockRegistry = { getByDriverId: jest.fn() };

	const driver1 = new Driver('d1', 'user-1', 'mac-1', 'henry', 'Driver One');
	const driver2 = new Driver('d2', 'user-1', 'mac-2', 'henry', 'Driver Two');

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				ListDriversByUserUseCase,
				{ provide: DriverConnectionRegistry, useValue: mockRegistry },
				{ provide: 'IDriverRepository', useValue: mockDriverRepo },
			],
		}).compile();

		useCase = module.get(ListDriversByUserUseCase);
		jest.clearAllMocks();
	});

	it("lists the user's drivers, each with whether it's connected", async () => {
		mockDriverRepo.findAllByUser.mockResolvedValue([driver1, driver2]);
		mockRegistry.getByDriverId.mockImplementation((id: string) => id === 'd1' ? {} : undefined);

		const result = await useCase.execute('user-1');

		expect(mockDriverRepo.findAllByUser).toHaveBeenCalledWith('user-1');
		expect(result).toEqual([
			expect.objectContaining({ id: 'd1', name: 'Driver One', online: true }),
			expect.objectContaining({ id: 'd2', name: 'Driver Two', online: false }),
		]);
	});

	it('returns an empty list when the user has no drivers', async () => {
		mockDriverRepo.findAllByUser.mockResolvedValue([]);

		expect(await useCase.execute('user-1')).toEqual([]);
	});
});
