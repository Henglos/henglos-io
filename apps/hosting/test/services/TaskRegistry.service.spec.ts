import { TaskRegistry } from '@/application/services/TaskRegistry.service';
import { Task } from '@/domain/entities/Task';
import type { TelemetryService } from '@/application/services/Telemetry.service';
import type { DriverTasksState } from '@henglosio/shared';

const USER = 'user', DRIVER = 'driver';
const telemetry = { taskStarted: () => {}, taskFinished: () => {} } as unknown as TelemetryService;
const NOTHING: DriverTasksState = { running: [], finished: [] };

describe('TaskRegistry', () => {

	let registry: TaskRegistry;
	let cancelled: string[];
	const later = () => new Date(Date.now() + 1000);

	const start = async (type: Task['type']) => {
		const task = Task.create({ type, workflowId: 'wf', userId: USER, driverId: DRIVER, port: 'COM3' });
		await registry.register({ task, teardown: () => {} });
		await registry.ingest(DRIVER, { taskId: task.id, seq: 0, kind: 'status', status: 'running' });
		return task;
	};

	beforeEach(() => {
		jest.useFakeTimers();
		registry = new TaskRegistry(telemetry);
		cancelled = [];
		registry.onCancel(({ taskId }) => cancelled.push(taskId));
	});

	afterEach(() => jest.useRealTimers());

	describe('when the driver drops off', () => {

		it('keeps a build waiting, and it carries on if the driver comes back', async () => {
			const task = await start('compile');
			await registry.markDriverGone(DRIVER);
			expect(task.status).toBe('running');

			const toCancel = await registry.reconcile(DRIVER, USER, { running: [{ taskId: task.id, type: 'compile', workflowId: 'wf', startedAt: Date.now() }], finished: [] }, later());
			jest.advanceTimersByTime(60_000);

			expect(toCancel).toEqual([]);
			expect(task.status).toBe('running');
		});

		it('fails it if the driver stays away', async () => {
			const task = await start('compile');
			await registry.markDriverGone(DRIVER);
			await jest.advanceTimersByTimeAsync(30_000);

			expect(task.status).toBe('failed');
			expect(task.error).toBe('driver_disconnected');
		});

		it('fails what the hosting drives step by step at once', async () => {
			const task = await start('execute');
			await registry.markDriverGone(DRIVER);
			expect(task.status).toBe('failed');
		});

	});

	describe('reconcile', () => {

		it('adopts what the driver runs and this hosting forgot, so it can be stopped again', async () => {
			const toCancel = await registry.reconcile(DRIVER, USER, { running: [{ taskId: 'lost', type: 'flash', workflowId: 'wf', port: 'COM3', startedAt: 1000 }], finished: [] }, later());
			expect(toCancel).toEqual([]);

			const adopted = registry.find('lost', USER)!;
			expect(adopted).toMatchObject({ type: 'flash', workflowId: 'wf', port: 'COM3', status: 'running', driverId: DRIVER });

			await registry.stop('lost', USER);
			expect(adopted.status).toBe('stopping');
			expect(cancelled).toEqual(['lost']);

			await registry.ingest(DRIVER, { taskId: 'lost', seq: 0, kind: 'result', ok: false, error: 'cancelled' });
			expect(adopted.status).toBe('cancelled');
		});

		it('has the driver stop what no one can drive any more', async () => {
			const toCancel = await registry.reconcile(DRIVER, USER, { running: [{ taskId: 'play', type: 'execute', workflowId: 'wf', startedAt: 1000 }], finished: [] }, later());
			expect(toCancel).toEqual(['play']);
			expect(registry.find('play')).toBeNull();
		});

		it('has the driver stop what is over here, and what was being stopped', async () => {
			const over = await start('execute');
			await registry.markDriverGone(DRIVER);
			const stopping = await start('compile');
			await registry.stop(stopping.id, USER);

			const running = [over, stopping].map(task => ({ taskId: task.id, type: task.type, workflowId: 'wf', startedAt: 1000 }));
			expect(await registry.reconcile(DRIVER, USER, { running, finished: [] }, later())).toEqual([over.id, stopping.id]);
		});

		it('ends a task as the driver says it ended, when its end was missed', async () => {
			const task = await start('compile');
			await registry.reconcile(DRIVER, USER, { running: [], finished: [{ taskId: task.id, ok: true }] }, later());
			expect(task.status).toBe('succeeded');
		});

		it('fails a task the driver no longer knows', async () => {
			const task = await start('compile');
			await registry.reconcile(DRIVER, USER, NOTHING, later());
			expect(task.status).toBe('failed');
			expect(task.error).toBe('driver_lost_task');
		});

		it('leaves alone a task created after the driver was asked', async () => {
			const since = new Date();
			jest.advanceTimersByTime(10);
			const task = await start('compile');
			await registry.reconcile(DRIVER, USER, NOTHING, since);
			expect(task.status).toBe('running');
		});

		it('calls off the wait for a driver that came back', async () => {
			const task = await start('compile');
			await registry.markDriverGone(DRIVER);
			await registry.reconcile(DRIVER, USER, { running: [{ taskId: task.id, type: 'compile', workflowId: 'wf', startedAt: 1000 }], finished: [] }, later());
			await jest.advanceTimersByTimeAsync(60_000);
			expect(task.status).toBe('running');
		});

	});

	it('fails a task whose start the driver never answers, and tells it to stop', async () => {
		const task = Task.create({ type: 'compile', workflowId: 'wf', userId: USER, driverId: DRIVER });
		await registry.register({ task, teardown: () => {} });
		await jest.advanceTimersByTimeAsync(30_000);

		expect(task.status).toBe('failed');
		expect(task.error).toBe('driver_no_response');
		expect(cancelled).toEqual([task.id]);
	});

	it('does not fail a task the driver answered', async () => {
		const task = await start('compile');
		await jest.advanceTimersByTimeAsync(60_000);
		expect(task.status).toBe('running');
	});

	it('stopping a task that is over here still reaches the driver', async () => {
		const task = await start('execute');
		await registry.markDriverGone(DRIVER);
		await registry.stop(task.id, USER);
		expect(cancelled).toEqual([task.id]);
	});

});
