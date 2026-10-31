import { DriverConnectionRegistry } from '@/application/services/DriverConnectionRegistry.service';
import type { Socket } from 'socket.io';

function makeSocket(id: string): Socket {
	return { id, emit: jest.fn() } as unknown as Socket;
}

describe('DriverConnectionRegistry', () => {
	let registry: DriverConnectionRegistry;

	beforeEach(() => {
		registry = new DriverConnectionRegistry();
	});

	describe('register() / isConnected()', () => {
		it('marks the driver as connected after registering', () => {
			registry.register('driver-1', 'user-1', makeSocket('s1'));
			expect(registry.isConnected('driver-1')).toBe(true);
		});

		it('returns false for an unknown driver', () => {
			expect(registry.isConnected('unknown')).toBe(false);
		});

		it('overwrites an existing registration with the same driverId', () => {
			const first = makeSocket('s1');
			const second = makeSocket('s2');
			registry.register('driver-1', 'user-1', first);
			registry.register('driver-1', 'user-1', second);
			expect(registry.getByDriverId('driver-1')?.socket).toBe(second);
		});
	});

	describe('getByDriverId()', () => {
		it('returns the connection for a registered driver', () => {
			const socket = makeSocket('s1');
			registry.register('driver-1', 'user-1', socket);

			const conn = registry.getByDriverId('driver-1');

			expect(conn?.driverId).toBe('driver-1');
			expect(conn?.userId).toBe('user-1');
			expect(conn?.socket).toBe(socket);
			expect(conn?.connectedAt).toBeInstanceOf(Date);
		});

		it('returns undefined for an unknown driver', () => {
			expect(registry.getByDriverId('no-such-driver')).toBeUndefined();
		});
	});

	describe('unregisterBySocketId()', () => {
		it('removes the connection and returns it', () => {
			const socket = makeSocket('s1');
			registry.register('driver-1', 'user-1', socket);

			const removed = registry.unregisterBySocketId('s1');

			expect(removed?.driverId).toBe('driver-1');
			expect(registry.isConnected('driver-1')).toBe(false);
		});

		it('returns undefined when socketId is not found', () => {
			expect(registry.unregisterBySocketId('nonexistent')).toBeUndefined();
		});

		it('only removes the connection whose socketId matches', () => {
			registry.register('driver-1', 'user-1', makeSocket('s1'));
			registry.register('driver-2', 'user-1', makeSocket('s2'));

			registry.unregisterBySocketId('s1');

			expect(registry.isConnected('driver-1')).toBe(false);
			expect(registry.isConnected('driver-2')).toBe(true);
		});
	});

	describe('getAllByUser()', () => {
		it('returns all connections belonging to a user', () => {
			registry.register('driver-1', 'user-1', makeSocket('s1'));
			registry.register('driver-2', 'user-1', makeSocket('s2'));
			registry.register('driver-3', 'user-2', makeSocket('s3'));

			const results = registry.getAllByUser('user-1');

			expect(results).toHaveLength(2);
			expect(results.every(c => c.userId === 'user-1')).toBe(true);
		});

		it('returns an empty array when the user has no connections', () => {
			expect(registry.getAllByUser('user-99')).toEqual([]);
		});
	});

	describe('emit()', () => {
		it('calls socket.emit with the event and payload, returns true', () => {
			const socket = makeSocket('s1');
			registry.register('driver-1', 'user-1', socket);

			const result = registry.emit('driver-1', 'some:event', { data: 42 });

			expect(result).toBe(true);
			expect(socket.emit).toHaveBeenCalledWith('some:event', { data: 42 });
		});

		it('returns false when the driver is not connected', () => {
			const result = registry.emit('not-connected', 'event', {});
			expect(result).toBe(false);
		});
	});
});
