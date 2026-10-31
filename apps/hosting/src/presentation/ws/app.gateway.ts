import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { TokenService } from '@/application/services/Token.service';
import { TaskRegistry } from '@/application/services/TaskRegistry.service';
import { ListDevicesUseCase } from '@/application/use-cases/driver/ListDevices.use-case';
import { ReplTaskUseCase } from '@/application/use-cases/tasks/ReplTask.use-case';
import type { ReplData, TaskSubscribeInDTO } from '@henglosio/shared';

/**
 * The studio's socket — Socket.IO on /io/ws, namespace /app, authenticated
 * with the user's access token (`Authorization: Bearer <token>` in the
 * handshake). What reaches the studio live goes through it: task events
 * (`task:<taskId>`), the REPL's output (`repl:<taskId>`), drivers and boards
 * coming and going.
 *
 * One socket per user: a newer connection of the same user takes the place
 * of the older one.
 */
@WebSocketGateway({ path: '/io/ws', namespace: '/app', cors: { origin: '*' } })
export class AppWSGateway implements OnGatewayConnection, OnGatewayDisconnect {
	private readonly userSockets = new Map<string, Socket>();

	constructor(
		private readonly tokenService: TokenService,
		private readonly listDevices: ListDevicesUseCase,
		private readonly taskRegistry: TaskRegistry,
		private readonly repl: ReplTaskUseCase,
	) {
		// Live task events -> the owning user's socket, on the per-task channel.
		this.taskRegistry.onEvent(({ userId, taskId, event }) => {
			this.userSockets.get(userId)?.emit(`task:${taskId}`, event);
		});
	}

	// No token, or not a valid one: disconnected.
	async handleConnection(client: Socket) {
		const authHeader = client.handshake.headers.authorization;
		if (!authHeader) return client.disconnect();

		try {
			const user = this.tokenService.verify(
				authHeader.replace('Bearer ', ''),
			);
			client.data.userId = user.userId;
			this.userSockets.set(user.userId, client);
		} catch {
			client.disconnect();
		}
	}

	async handleDisconnect(client: Socket) {
		const userId: string | undefined = client.data.userId;
		if (userId && this.userSockets.get(userId)?.id === client.id) {
			this.userSockets.delete(userId);
			// Nobody's left to type in its terminals — they'd hold the board.
			await this.repl.endFor(userId);
		}
	}

	/** What's typed in the studio's REPL terminal. */
	@SubscribeMessage('repl:input')
	handleReplInput(
		@ConnectedSocket() client: Socket,
		@MessageBody() body: ReplData,
	) {
		const userId = client.data.userId as string | undefined;
		if (!userId || !body?.taskId || !(body.data instanceof Uint8Array)) return;
		this.repl.input(userId, body);
	}

	/** Sends an event to a user's studio — nothing happens when they aren't connected. */
	emit<T = unknown>(userId: string, event: string, data: T) {
		this.userSockets.get(userId)?.emit(event, data);
	}

	/**
	 * The studio starts following a task: what happened so far is replayed on
	 * `task:<taskId>` (with a `gap` event when older ones were dropped); new
	 * events follow on the same channel. `task:<taskId>:error` when there's no
	 * such task of the user's.
	 */
	@SubscribeMessage('task:subscribe')
	async handleTaskSubscribe(
		@ConnectedSocket() client: Socket,
		@MessageBody() body: TaskSubscribeInDTO,
	) {
		const userId = client.data.userId as string | undefined;
		if (!userId) return;

		const snap = await this.taskRegistry.snapshot(body.taskId, userId);
		if (!snap) {
			client.emit(`task:${body.taskId}:error`, { error: 'task_not_found' });
			return;
		}

		// Replay the buffered events, then a gap marker if any were evicted.
		for (const event of snap.events) client.emit(`task:${body.taskId}`, event);
		if (snap.dropped > 0) {
			client.emit(`task:${body.taskId}`, {
				taskId: body.taskId,
				seq: -1,
				kind: 'gap',
				dropped: snap.dropped,
			});
		}
	}

	/** The boards on one of the user's drivers — answered as `device:list:pending`, or `device:list:error`. */
	@SubscribeMessage('device:list')
	async handleDeviceList(
		@ConnectedSocket() client: Socket,
		@MessageBody() body: { driverId: string },
	) {
		const userId = client.data.userId as string;
		const commandId = await this.listDevices.execute(userId, body.driverId)
		.catch((err) => {
			client.emit('device:list:error', err);
		});
		if (commandId) client.emit('device:list:pending', { id: commandId });
	}
}
