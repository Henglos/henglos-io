import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

/** A driver connected to the hosting, over its socket. */
export type DriverConnection = {
	socket: Socket;
	driverId: string;
	userId: string;
	connectedAt: Date;
};


/**
 * The drivers connected right now, in memory, by driver id — how the hosting
 * reaches a driver to send it a command. A driver that isn't here is offline.
 */
@Injectable()
export class DriverConnectionRegistry {

	private readonly logger = new Logger(DriverConnectionRegistry.name);
	private readonly connections = new Map<string, DriverConnection>();

	/** A driver connected — replaces an older connection of the same driver. */
	register(driverId: string, userId: string, socket: Socket): void {
		this.connections.set(driverId, { socket, driverId, userId, connectedAt: new Date() });
		this.logger.log(`Registered driver ${driverId} (user: ${userId})`);
	}

	/** A socket closed: forgets the driver it was. @returns Its connection, if it was one. */
	unregisterBySocketId(socketId: string): DriverConnection | undefined {
		for (const [driverId, conn] of this.connections.entries()) {
			if (conn.socket.id === socketId) {
				this.connections.delete(driverId);
				this.logger.log(`Unregistered driver ${driverId}`);
				return conn;
			}
		}
		return undefined;
	}

	getByDriverId(driverId: string): DriverConnection | undefined {
		return this.connections.get(driverId);
	}

	/** A user's connected drivers. */
	getAllByUser(userId: string): DriverConnection[] {
		return Array.from(this.connections.values()).filter(c => c.userId === userId);
	}

	isConnected(driverId: string): boolean {
		return this.connections.has(driverId);
	}

	/**
	 * Sends an event to a driver.
	 *
	 * @returns Whether it was sent — false when the driver isn't connected.
	 */
	emit<T extends unknown>(driverId: string, event: string, payload: T): boolean {
		const conn = this.connections.get(driverId);
		if (!conn) return false;
		conn.socket.emit(event, payload);
		return true;
	}

}
