import type { DriverTasksState, DriverCreateWorkflowInDTO, DriverDeleteWorkflowInDTO, DriverExecuteFinishInDTO, DriverExecuteFrameInDTO, DriverListDevicesInDTO, DriverPortStatusInDTO, DriverRemovePackageInDTO, DriverSyncWorkflowInDTO, DriverSyncWorkflowsInDTO, ReplData, TaskCancelInDTO, TaskStartInDTO } from "@henglosio/shared";
import { injectable } from "tsyringe";

import { SocketIOClient } from "../infrastructure/ws/SocketIOClient.impl.js";
import { CommandContext } from "../domain/entities/CommandContext.js";
import { TaskManager } from "../application/services/TaskManager.service.js";
import { TaskCommandRegistry } from "../application/commands/TaskCommand.registry.js";
import { CreateWorkflowUseCase } from "../application/use-cases/workflow/CreateWorkflow.use-case.js";
import { DeleteWorkflowUseCase } from "../application/use-cases/workflow/DeleteWorkflow.use-case.js";
import { SyncWorkflowUseCase } from "../application/use-cases/workflow/SyncWorkflow.use-case.js";
import { SyncWorkflowsUseCase } from "../application/use-cases/workflow/SyncWorkflows.use-case.js";
import { ListDevicesUseCase } from "../application/use-cases/devices/ListDevices.use-case.js";
import { RemovePackageUseCase } from "../application/use-cases/package/RemovePackage.use-case.js";
import { restartDriver } from "../process-manager.js";
import { createLogger } from "../infrastructure/logger/Logger.js";

const log = createLogger("gateway");

/**
 * What the hosting sends the driver over its socket, routed to what handles it: tasks
 * (task:start / task:cancel, the execute and REPL streams), workflows (create, delete, sync),
 * devices, packages and restart.
 */
@injectable()
export class GatewayWS {

	constructor(
		private readonly ws: SocketIOClient,
		private readonly taskManager: TaskManager,
		private readonly taskCommands: TaskCommandRegistry,
		private readonly createWorkflowUseCase: CreateWorkflowUseCase,
		private readonly deleteWorkflowUseCase: DeleteWorkflowUseCase,
		private readonly syncWorkflowUseCase: SyncWorkflowUseCase,
		private readonly syncWorkflowsUseCase: SyncWorkflowsUseCase,
		private readonly listDevicesUseCase: ListDevicesUseCase,
		private readonly removePackageUseCase: RemovePackageUseCase
	) {

		this.registerTaskStart();
		this.registerTaskCancel();
		this.registerExecuteWorkflowContinue();
		this.registerExecuteWorkflowFinish();
		this.registerReplInput();

		this.registerCreateWorkflow();
		this.registerDeleteWorkflow();
		this.registerSyncWorkflow();
		this.registerSyncWorkflows();
		this.registerRemovePackage();

		this.registerListDevices();
		this.registerRestart();

	}

	// ── The driver itself ────────────────────────────────────────────────────

	registerRestart() {

		// Answered first, then restarted: whatever it ran (a Play, a REPL)
		// ends with this process, and its ports are free for the new one.
		this.ws.socket?.on("driver:restart", (data: { id: string }) => {
			this.ws.socket?.emit("driver:restart:result", { id: data.id, type: "done", data: null });
			setTimeout(() => void restartDriver(), 300);
		});

	}

	// ── Tasks (compile / flash / execute / record) ──────────────────────────

	registerTaskStart() {

		this.ws.socket?.on("task:start", (data: TaskStartInDTO) => {

			const command = this.taskCommands.get(data.type);

			if (!command) {
				log.warn(`Unknown task type ${data.type} (task ${data.taskId})`);
				this.taskManager.reject(data.taskId, `unknown_task_type: ${data.type}`);
				return;
			}

			if (!command.isValidPayload(data.payload)) {
				log.warn(`Invalid payload for ${data.type} (task ${data.taskId})`);
				this.taskManager.reject(data.taskId, `invalid_payload: ${data.type}`);
				return;
			}

			this.taskManager.run(data.taskId, command, data.payload);

		});

	}

	registerTaskCancel() {

		this.ws.socket?.on("task:cancel", (data: TaskCancelInDTO) => {
			this.taskManager.cancel(data.taskId);
		});

		// What's running here — the hosting asks each time this driver connects.
		this.ws.socket?.on("tasks:state", (ack: (state: DriverTasksState) => void) => {
			ack(this.taskManager.state());
		});

		// Frees a board, whatever is holding it.
		this.ws.socket?.on("port:release", (data: DriverPortStatusInDTO) => {
			this.ws.socket?.emit("port:release:result", { id: data.id, type: "done", data: { tasks: this.taskManager.releasePort(data.port) } });
		});

		// What has a board busy — so the studio can show it, and pick it up.
		this.ws.socket?.on("port:status", (data: DriverPortStatusInDTO) => {
			this.ws.socket?.emit("port:status:result", { id: data.id, type: "done", data: { tasks: this.taskManager.onPort(data.port) } });
		});

	}

	// The execute session's per-frame protocol — hosting's graph walker pushes
	// the next frame and closes the session. These don't create/cancel the task,
	// they drive an already-running one.
	registerExecuteWorkflowContinue() {

		this.ws.socket?.on("workflow:execute:continue", async (data: DriverExecuteFrameInDTO) => {
			await this.taskCommands.execute.continue(data.id, data.frame);
		});

	}

	registerExecuteWorkflowFinish() {

		this.ws.socket?.on("workflow:execute:finish", (data: DriverExecuteFinishInDTO) => {
			this.taskCommands.execute.finish(data.id);
		});

	}

	// What's typed in the studio's REPL terminal — to its running repl task.
	registerReplInput() {

		this.ws.socket?.on("repl:input", (data: ReplData) => {
			this.taskCommands.repl.write(data.taskId, new Uint8Array(data.data));
		});

	}

	// ── Plain request/response ops ─────────────────────────────────────────

	registerCreateWorkflow() {

		this.ws.socket?.on("workflow:create", async (data: DriverCreateWorkflowInDTO) => {

			const context = new CommandContext(data.id, this.ws);

			const result = await this.createWorkflowUseCase.execute(data.workflowId, data.packages, context)
			.catch((error) => {

				this.ws.socket?.emit("workflow:create:result", {
					id: data.id,
					type: "error",
					data: error
				});

			});

			this.ws.socket?.emit("workflow:create:result", {
				id: data.id,
				type: "done",
				data: result
			});

		});

	}

	registerDeleteWorkflow() {

		this.ws.socket?.on("workflow:delete", async (data: DriverDeleteWorkflowInDTO) => {

			const context = new CommandContext(data.id, this.ws);
			const result = await this.deleteWorkflowUseCase.execute(data.workflowId, context)
			.catch((error) => {

				this.ws.socket?.emit("workflow:delete:result", {
					id: data.id,
					type: "error",
					data: error
				});

			});

			this.ws.socket?.emit("workflow:delete:result", {
				id: data.id,
				type: "done",
				data: result
			});

		});

	}

	registerSyncWorkflow() {

		this.ws.socket?.on("workflow:sync", async (data: DriverSyncWorkflowInDTO) => {

			const context = new CommandContext(data.id, this.ws);
			const result = await this.syncWorkflowUseCase.execute(data.workflowId, data.packages, context)
			.catch((error) => {

				log.error(`Syncing workflow ${data.workflowId} failed:`, error);

				this.ws.socket?.emit("workflow:sync:result", {
					id: data.id,
					type: "error",
					data: error
				});

			});


			this.ws.socket?.emit("workflow:sync:result", {
				id: data.id,
				type: "done",
				data: {
					synced: result
				}
			});

		});

	}

	registerSyncWorkflows() {

		this.ws.socket?.on("workflows:sync", async (data: DriverSyncWorkflowsInDTO) => {

			const context = new CommandContext(data.id, this.ws);
			const result = await this.syncWorkflowsUseCase.execute(data.workflows, context)
			.catch((error) => {

				this.ws.socket?.emit("workflows:sync:result", {
					id: data.id,
					type: "error",
					data: error
				});

			});

			this.ws.socket?.emit("workflows:sync:result", {
				id: data.id,
				type: "done",
				data: {
					synced: result
				}
			});

		});

	}

	registerRemovePackage() {

		this.ws.socket?.on("package:remove", async (data: DriverRemovePackageInDTO) => {

			const context = new CommandContext(data.id, this.ws);
			const result = await this.removePackageUseCase.execute(data.name, data.version, context)
			.catch((error) => {

				this.ws.socket?.emit("package:remove:result", {
					id: data.id,
					type: "error",
					data: error
				});

			});

			this.ws.socket?.emit("package:remove:result", {
				id: data.id,
				type: "done",
				data: result
			});

		});

	}

	registerListDevices() {

		this.ws.socket?.on("device:list", async (data: DriverListDevicesInDTO) => {

			const context = new CommandContext(data.id, this.ws);
			const devices = await this.listDevicesUseCase.execute(context).
			catch((error) => {

				this.ws.socket?.emit("device:list:result", {
					id: data.id,
					type: "error",
					data: error
				})

			});

			this.ws.socket?.emit("device:list:result", {
				id: data.id,
				type: "done",
				data: { devices }
			});

		});

	}

}
