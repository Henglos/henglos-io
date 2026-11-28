import { ConfigService } from '@nestjs/config';
import { GetUpdateStatusUseCase } from '@/application/use-cases/system/GetUpdateStatus.use-case';

// Only the constant it uses: @henglosio/shared's CJS build pulls ESM-only modules jest can't load.
jest.mock('@henglosio/shared', () => ({ HENGLOSIO_REPOSITORY: 'https://github.com/Henglos/henglos-io' }));

const TAGS = ['workbench-rp2@1.0.0', 'v1.7.0', 'v1.6.2', 'v1.8.0-beta', 'v1.6.0', 'not-a-tag'].map(name => ({ name }));

const make = (env: { HIO_VERSION?: string; HIO_UPDATE_CHECK?: boolean }) =>
	new GetUpdateStatusUseCase({ get: (key: string) => ({ HIO_UPDATE_CHECK: true, ...env } as Record<string, unknown>)[key] } as unknown as ConfigService<never, true>);

describe('GetUpdateStatusUseCase', () => {
	const fetchMock = jest.fn();

	beforeEach(() => {
		fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => TAGS });
		global.fetch = fetchMock as unknown as typeof fetch;
	});

	it('offers the newest stable release tag, with its GitHub page', async () => {
		expect(await make({ HIO_VERSION: 'v1.6.0' }).execute()).toEqual({
			current: '1.6.0',
			latest: '1.7.0',
			available: true,
			url: 'https://github.com/Henglos/henglos-io/releases/tag/v1.7.0',
		});
	});

	it('offers nothing when already on the newest', async () => {
		expect(await make({ HIO_VERSION: '1.7.0' }).execute()).toMatchObject({ latest: '1.7.0', available: false, url: null });
	});

	it('offers a prerelease only to an installation on one', async () => {
		expect(await make({ HIO_VERSION: '1.7.1-dev.0' }).execute()).toMatchObject({ latest: '1.8.0-beta', available: true });
	});

	it("doesn't ask GitHub when its version is unknown or the check is off", async () => {
		expect(await make({}).execute()).toMatchObject({ current: null, available: false });
		expect(await make({ HIO_VERSION: 'main' }).execute()).toMatchObject({ current: null, available: false });
		expect(await make({ HIO_VERSION: '1.6.0', HIO_UPDATE_CHECK: false }).execute()).toMatchObject({ latest: null, available: false });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('asks GitHub once for many calls, and survives it failing', async () => {
		const useCase = make({ HIO_VERSION: '1.6.0' });
		await Promise.all([useCase.execute(), useCase.execute()]);
		await useCase.execute();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		fetchMock.mockResolvedValue({ ok: false, status: 403 });
		expect(await make({ HIO_VERSION: '1.6.0' }).execute()).toMatchObject({ latest: null, available: false });
	});
});
