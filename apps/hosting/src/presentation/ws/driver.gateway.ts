import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { DriverAuthService } from '@/application/services/DriverAuth.service';
import { DriverConnectionRegistry } from '@/application/services/DriverConnectionRegistry.service';
import { TaskRegistry } from '@/application/services/TaskRegistry.service';
import { InvalidToken } from '@/application/errors/use-cases/Auth.error';
import { AppWSGateway } from './app.gateway';
import { SyncWorkflowsUseCase } from '@/application/use-cases/driver/SyncWorkflow.use-case';
import { type Device, type ReplData, type TaskEvent, BackendDriverConnectedOutDTO, BackendDriverDisconnectedOutDTO } from '@henglosio/shared';


/**
 * The drivers' socket — Socket.IO on /io/ws, namespace /driver,
 * authenticated with the driver's access token (in the handshake's
 * `Authorization`). A connected driver is reachable for commands (see
 * DriverConnectionRegistry); what it sends — task events, REPL output, boards
 * plugged and unplugged — is passed on to its user's studio.
 */
@WebSocketGateway({
	path: '/io/ws',
	namespace: '/driver',
	cors: { origin: '*' },
})
export class DriverWSGateway
	implements OnGatewayConnection, OnGatewayDisconnect
{
	private readonly logger = new Logger(DriverWSGateway.name);

	constructor(
		private readonly driverAuth: DriverAuthService,
		private readonly registry: DriverConnectionRegistry,
		private readonly taskRegistry: TaskRegistry,
		private readonly appGateway: AppWSGateway,
		private readonly driverSyncUseCase: SyncWorkflowsUseCase,
	) {}

	// A driver connects: registered, its user told, and its workflows synced.
	async handleConnection(client: Socket) {

		// Auth is the only thing that should drop the connection.
		let driverAuth;
		try {
			const token = client.handshake.headers.authorization;
			if (!token) throw new InvalidToken();

			driverAuth = this.driverAuth.verify(token);
			client.data.driverAuth = driverAuth;
			this.registry.register(driverAuth.id, driverAuth.userId, client);
		} catch (e) {
			this.logger.warn(
				`Driver connection rejected: ${(e as Error).message}`,
			);
			client.disconnect();
			return;
		}

		this.appGateway.emit(driverAuth.userId, "driver:connected", {
			driverId: driverAuth.id,
		} as BackendDriverConnectedOutDTO);

		// A failed initial sync shouldn't kill an authenticated connection —
		// log it and let the driver keep running; the app can re-trigger a sync.
		try {
			await this.driverSyncUseCase.execute(
				driverAuth.userId,
				driverAuth.id,
			);
		} catch (e) {
			this.logger.error(
				`Initial workflow sync failed for driver ${driverAuth.id}: ${(e as Error).message}`,
			);
		}
	}

	// A driver goes: its user is told, and its unfinished tasks fail (driver_disconnected).
	async handleDisconnect(client: Socket) {

		const driverAuth = client.data.driverAuth;
		if (driverAuth) {
			this.appGateway.emit(driverAuth.userId, "driver:disconnected", {
				driverId: driverAuth.id,
			} satisfies BackendDriverDisconnectedOutDTO);

			await this.taskRegistry.markDriverGone(driverAuth.id);
		}

		this.registry.unregisterBySocketId(client.id);

	}

	/** A task's progress (a log line, a status, its result) — into the TaskRegistry, which fans it out. */
	@SubscribeMessage('task:event')
	async handleTaskEvent(
		@ConnectedSocket() client: Socket,
		@MessageBody() event: TaskEvent,
	) {
		const { driverAuth } = client.data;
		if (!driverAuth) return;
		await this.taskRegistry.ingest(driverAuth.id, event);
	}

	/** What the board answered in a REPL terminal — to the user whose repl task it is, if it's this driver's. */
	@SubscribeMessage('repl:output')
	handleReplOutput(
		@ConnectedSocket() client: Socket,
		@MessageBody() body: ReplData,
	) {
		const { driverAuth } = client.data;
		if (!driverAuth || !body?.taskId) return;
		const task = this.taskRegistry.find(body.taskId);
		if (!task || task.type !== 'repl' || task.driverId !== driverAuth.id) return;
		this.appGateway.emit(task.userId, `repl:${task.id}`, body.data);
	}

	/** A board plugged into the driver's machine — to its user's studio. */
	@SubscribeMessage('device:connected')
	handleDeviceConnected(
		@ConnectedSocket() client: Socket,
		@MessageBody() data: Device,
	) {
		const { driverAuth } = client.data;
		if (!driverAuth) return;
		this.appGateway.emit(driverAuth.userId, 'device:connected', data);
	}

	/** A board unplugged — to its user's studio. */
	@SubscribeMessage('device:disconnected')
	handleDeviceDisconnected(
		@ConnectedSocket() client: Socket,
		@MessageBody() data: Device,
	) {
		const { driverAuth } = client.data;
		if (!driverAuth) return;
		this.appGateway.emit(driverAuth.userId, 'device:disconnected', data);
	}

}
