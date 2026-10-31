import { Test } from '@nestjs/testing';
import { RegisterDriverUseCase } from '@/application/use-cases/driver/RegisterDriver.use-case';
import { DriverAuthService } from '@/application/services/DriverAuth.service';
import { Driver } from '@/domain/entities/Driver';

describe('RegisterDriverUseCase', () => {
	let useCase: RegisterDriverUseCase;

	const mockUserRepo   = { findById: jest.fn() };
	const mockDriverRepo = { findByDriverId: jest.fn(), findAllByUser: jest.fn(), save: jest.fn() };
	const mockDriverAuth = { generateToken: jest.fn() };

	const INPUT = { driverId: 'machine-1', machineOS: 'linux', name: 'My Driver' };
	const USER  = { id: 'user-1' };
	const SAVED_DRIVER = new Driver('d-uuid', 'machine-1', 'user-1', 'My Driver', 'linux');

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				RegisterDriverUseCase,
				{ provide: DriverAuthService,     useValue: mockDriverAuth },
				{ provide: 'IDriverRepository',  useValue: mockDriverRepo },
				{ provide: 'IUserRepository',    useValue: mockUserRepo },
			],
		}).compile();

		useCase = module.get(RegisterDriverUseCase);
		jest.clearAllMocks();
	});

	it('throws UserNotFound when the user does not exist', async () => {
		mockUserRepo.findById.mockResolvedValue(null);
		await expect(useCase.execute('user-1', INPUT)).rejects.toThrow('user_not_found');
	});

	it('throws DriverAlreadyExists when the driverId is already registered', async () => {
		mockUserRepo.findById.mockResolvedValue(USER);
		mockDriverRepo.findByDriverId.mockResolvedValue(SAVED_DRIVER);
		await expect(useCase.execute('user-1', INPUT)).rejects.toThrow('driver_already_exists');
	});

	it('creates the driver and returns its token on success', async () => {
		mockUserRepo.findById.mockResolvedValue(USER);
		mockDriverRepo.findByDriverId.mockResolvedValue(null);
		mockDriverRepo.findAllByUser.mockResolvedValue([]);
		mockDriverRepo.save.mockResolvedValue(SAVED_DRIVER);
		mockDriverAuth.generateToken.mockResolvedValue('jwt-token');

		const result = await useCase.execute('user-1', INPUT);

		expect(result.token).toBe('jwt-token');
		expect(result.driver).toBe(SAVED_DRIVER);
	});

	it('saves the driver with the correct input fields', async () => {
		mockUserRepo.findById.mockResolvedValue(USER);
		mockDriverRepo.findByDriverId.mockResolvedValue(null);
		mockDriverRepo.findAllByUser.mockResolvedValue([]);
		mockDriverRepo.save.mockResolvedValue(SAVED_DRIVER);
		mockDriverAuth.generateToken.mockResolvedValue('tok');

		await useCase.execute('user-1', INPUT);

		const saved: Driver = mockDriverRepo.save.mock.calls[0][0];
		expect(saved.driverId).toBe('machine-1');
		expect(saved.userId).toBe('user-1');
		expect(saved.name).toBe('My Driver');
		expect(saved.machineOS).toBe('linux');
	});
});
