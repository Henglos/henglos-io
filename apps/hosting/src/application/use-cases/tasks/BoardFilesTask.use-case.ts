import { Inject, Injectable } from "@nestjs/common";
import type { FsListOut, FsReadOut, TaskCancelInDTO, TaskFsPayload, TaskStartInDTO } from "@henglosio/shared";

import { Task } from "@/domain/entities/Task";
import { type IDriverRepository } from "@/domain/repositories/IDriverRepository.repo";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { TaskRegistry } from "@/application/services/TaskRegistry.service";
import { UserNotFound } from "@/application/errors/User.error";
import { DriverNotFound, DriverOffline } from "@/application/errors/Driver.error";
import { ActionRunFailed, WorkflowNotFound } from "@/application/errors/Workflow.error";

// A big file over the REPL takes a while (base64 at 115200 baud, ~4 KB/s).
const RESULT_TIMEOUT_MS = 120_000;
const WRITE_TIMEOUT_MS = 300_000;

/** The biggest file written to a board at once — a good part of an ESP32's ~1.4 MB, ~2 minutes over the REPL. */
export const BOARD_FILE_MAX_BYTES = 512 * 1024;

/**
 * The board's files, for the studio's file browser: an `fs` task on the
 * driver reads them through the raw REPL (holding the port, like any task on
 * the board) and answers in its result — awaited here, so the request gets
 * the tree or the file back directly.
 */
@Injectable()
export class BoardFilesTaskUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IDriverRepository") private readonly driverRepository: IDriverRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		private readonly driverConnection: DriverConnectionRegistry,
		private readonly taskRegistry: TaskRegistry,
	) {}

	/** The board's whole file tree. */
	list(userId: string, driverId: string, workflowId: string, port: string): Promise<FsListOut> {
		return this.run(userId, driverId, { workflowId, port, op: "list" }) as Promise<FsListOut>;
	}

	/** One file's contents. */
	read(userId: string, driverId: string, workflowId: string, port: string, path: string): Promise<FsReadOut> {
		return this.run(userId, driverId, { workflowId, port, op: "read", path }) as Promise<FsReadOut>;
	}

	// The changes — each answers the tree as it is after it.

	/** Writes a file (over what's there). @throws ActionRunFailed past BOARD_FILE_MAX_BYTES. */
	write(userId: string, driverId: string, workflowId: string, port: string, path: string, data: Uint8Array): Promise<FsListOut> {
		if (data.length > BOARD_FILE_MAX_BYTES) throw new ActionRunFailed(`Files go up to ${BOARD_FILE_MAX_BYTES / 1024} KB`);
		return this.run(userId, driverId, { workflowId, port, op: "write", path, data: new Uint8Array(data) }, WRITE_TIMEOUT_MS) as Promise<FsListOut>;
	}

	remove(userId: string, driverId: string, workflowId: string, port: string, path: string): Promise<FsListOut> {
		return this.run(userId, driverId, { workflowId, port, op: "delete", path }) as Promise<FsListOut>;
	}

	mkdir(userId: string, driverId: string, workflowId: string, port: string, path: string): Promise<FsListOut> {
		return this.run(userId, driverId, { workflowId, port, op: "mkdir", path }) as Promise<FsListOut>;
	}

	rename(userId: string, driverId: string, workflowId: string, port: string, path: string, to: string): Promise<FsListOut> {
		return this.run(userId, driverId, { workflowId, port, op: "rename", path, to }) as Promise<FsListOut>;
	}

	/**
	 * Starts an `fs` task and waits for its result.
	 *
	 * @throws UserNotFound, DriverNotFound, WorkflowNotFound, DriverOffline;
	 *   ActionRunFailed when the board fails or doesn't answer within `timeoutMs`.
	 */
	private async run(userId: string, driverId: string, payload: TaskFsPayload, timeoutMs = RESULT_TIMEOUT_MS): Promise<unknown> {

		if (!await this.userRepository.existsById(userId)) throw new UserNotFound();

		const driver = await this.driverRepository.findById(driverId);
		if (!driver || driver.userId !== userId) throw new DriverNotFound();

		const workflow = await this.workflowRepository.findById(payload.workflowId);
		if (!workflow || workflow.userId !== userId) throw new WorkflowNotFound();

		const connection = this.driverConnection.getByDriverId(driverId);
		if (!connection) throw new DriverOffline();

		const task = Task.create({ type: "fs", workflowId: payload.workflowId, userId, driverId, port: payload.port });

		// Listening before the start: a quick answer can't slip past.
		let unsubscribe = () => {};
		const result = new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => { unsubscribe(); reject(new ActionRunFailed("The board didn't answer in time")); }, timeoutMs);
			unsubscribe = this.taskRegistry.onEvent(({ taskId, event }) => {
				if (taskId !== task.id || event.kind !== "result") return;
				clearTimeout(timer);
				unsubscribe();
				if (event.ok) resolve(event.data);
				else reject(new ActionRunFailed(event.error ?? "The board's files couldn't be read"));
			});
		});

		await this.taskRegistry.register({
			task,
			teardown: () => { connection.socket.emit("task:cancel", { taskId: task.id } satisfies TaskCancelInDTO); },
		});

		try {
			connection.socket.emit("task:start", { taskId: task.id, type: "fs", payload } satisfies TaskStartInDTO);
		} catch (err) {
			await this.taskRegistry.fail(task.id, err instanceof Error ? err.message : String(err));
		}

		return result;

	}

}
