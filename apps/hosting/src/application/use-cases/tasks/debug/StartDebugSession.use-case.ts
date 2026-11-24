import { Inject, Injectable } from "@nestjs/common";
import {
	type DriverExecuteFinishInDTO,
	type TaskCancelInDTO,
	type TaskStartInDTO,
	buildRequestFrame,
	OutputId,
} from "@henglosio/shared";
import { GenerateExecuteCommand, workflowEntries } from "@henglosio/workflow";

import { Task } from "@/domain/entities/Task";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { TaskRegistry } from "@/application/services/TaskRegistry.service";
import { DebugSessionsService, type DebugSession, type DebugState } from "@/application/services/DebugSessions.service";
import { UserNotFound } from "@/application/errors/User.error";
import { DriverNotFound, DriverOffline } from "@/application/errors/Driver.error";
import { ActionNotFound } from "@/application/errors/Workflow.error";
import { awaitDriverResponse, FIRST_RESPONSE_TIMEOUT_MS, readResponse } from "../workflow/actionResponse";
import { BuildBoardInstall } from "../BuildBoardInstall";

/** Opens a debug session. */
@Injectable()
export class StartDebugSessionUseCase {

	private readonly generateExecuteCommand = new GenerateExecuteCommand();

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository,
		private readonly driverConnection: DriverConnectionRegistry,
		private readonly taskRegistry: TaskRegistry,
		private readonly debugSessions: DebugSessionsService,
		private readonly boardInstall: BuildBoardInstall,
	) {}

	/**
	 * Opens the session and runs Start — paused before the first action. From
	 * a trigger (`entryId`): arms it and listens — Continue waits for it to fire.
	 */
	async execute(userId: string, driverId: string, workflowId: string, port: string, baudrate: number, entryId?: string): Promise<DebugState> {

		if (!await this.userRepository.existsById(userId)) throw new UserNotFound();

		const driver = await this.driverRepository.findById(driverId);
		if (!driver || driver.userId !== userId) throw new DriverNotFound();

		const workflow = await this.debugSessions.load(workflowId, userId);

		const connection = this.driverConnection.getByDriverId(driverId);
		if (!connection) throw new DriverOffline();

		const entry = entryId ?? workflow.start.id;
		if (!workflowEntries(workflow).includes(entry)) throw new ActionNotFound();
		// A debug session starts the variables over from their initial values.
		const startPayload = this.generateExecuteCommand.execute(workflow, entry, undefined, { freshVariables: entry === workflow.start.id });
		if (!startPayload) throw new ActionNotFound();

		// A session left paused (a reload, Debug pressed again) still holds the
		// board's REPL — the driver would refuse this one as resource_busy.
		await this.debugSessions.releaseStale(userId, driverId);

		const task = Task.create({ type: "execute", workflowId, userId, driverId, port, label: "debug" });
		const socket = connection.socket;
		const signal = await this.taskRegistry.register({
			task,
			teardown: () => {
				socket.emit("workflow:execute:finish", { id: task.id } satisfies DriverExecuteFinishInDTO);
				socket.emit("task:cancel", { taskId: task.id } satisfies TaskCancelInDTO);
			},
		});

		const session: DebugSession = {
			id: task.id,
			userId,
			driverId,
			workflowId,
			socket,
			signal,
			startActionId: workflow.start.id,
			entryId: entry,
			listening: false,
			loop: workflow.start.configurations.find(c => c.base.displayName.toLowerCase() === "mode")?.value !== "once",
			nextActionId: null,
			ran: null,
			step: 0,
			busy: true,
			state: null,
			idle: setTimeout(() => {}, 0),
			finish: () => {
				clearTimeout(session.idle);
				this.debugSessions.sessions.delete(session.id);
				socket.emit("workflow:execute:finish", { id: session.id } satisfies DriverExecuteFinishInDTO);
			},
		};
		this.debugSessions.sessions.set(session.id, session);

		try {
			// What it uses goes on the board first — so the first answer may take a while.
			const install = await this.boardInstall.execute(userId, workflowId, workflow);
			const answer = awaitDriverResponse(socket, task.id, signal, FIRST_RESPONSE_TIMEOUT_MS);
			socket.emit("task:start", { taskId: task.id, type: "execute", payload: { workflowId, port, baudrate, frame: buildRequestFrame(startPayload), install } } satisfies TaskStartInDTO);
			if (entry === workflow.start.id) return this.debugSessions.step(session, workflow, entry, await answer);

			// A trigger's EXECUTE arms it.
			if (readResponse(await answer).id !== OutputId.SUCCESS) {
				throw new Error("The trigger couldn't start listening on the board — see the device log");
			}
			return this.debugSessions.listening(session, null);
		} catch (err) {
			throw await this.debugSessions.abort(session, err);
		} finally {
			session.busy = false;
		}

	}

}
