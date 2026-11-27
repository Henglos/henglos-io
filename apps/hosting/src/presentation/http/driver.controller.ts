import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Query,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AUTH_RATE_LIMIT } from '@/infrastructure/http/guards/RateLimit.guard';

import { AuthUser } from '@/infrastructure/http/decorators/AuthUser.decorator';
import { AuthGuard } from '@/infrastructure/http/guards/Auth.guard';
import { ZodValidationPipe } from '@/infrastructure/http/pipes/ZodValidation.pipe';


import { DeleteDriverUseCase } from '@/application/use-cases/driver/DeleteDriver.use-case';
import { ListDriversByUserUseCase } from '@/application/use-cases/driver/ListDriversByUser.use-case';


import { MinimalUser } from '@/domain/entities/AuthUser';
import {
	type DeleteDriverOut,
	type ExecuteWorkflowIn,
	ExecuteWorkflowInSchema,
	DebugStartInSchema,
	type DebugStartIn,
	type FlashWorkflowIn,
	type FsListOut,
	type FsPathIn,
	FsPathInSchema,
	type FsReadOut,
	type FsRenameIn,
	FsRenameInSchema,
	FlashWorkflowInSchema,
	type PortStatusOut,
	type ListDevicesOut,
	type ListVolumesOut,
	type ListDriversByUserOut,
	type LogsIdOut,
	type PairDriverIn,
	PairDriverInSchema,
	PairDriverOut,
	PairTokenOut,
	type RecordWorkflowIn,
	RecordWorkflowInSchema,
	type ReplStartIn,
	ReplStartInSchema,
	type TaskRecord,
} from '@henglosio/shared';
import { ListDevicesUseCase } from '@/application/use-cases/driver/ListDevices.use-case';
import { ListVolumesUseCase } from '@/application/use-cases/driver/ListVolumes.use-case';
import { RestartDriverUseCase } from '@/application/use-cases/driver/RestartDriver.use-case';
import { GetPortStatusUseCase } from '@/application/use-cases/driver/GetPortStatus.use-case';
import { CompileWorkflowTaskUseCase } from '@/application/use-cases/tasks/workflow/CompileWorkflowTask.use-case';
import { ReleasePortUseCase } from '@/application/use-cases/driver/ReleasePort.use-case';
import { FlashWorkflowTaskUseCase } from '@/application/use-cases/tasks/workflow/FlashWorkflowTask.use-case';
import { ExecuteWorkflowTaskUseCase } from '@/application/use-cases/tasks/workflow/ExecuteWorkflowTask.use-case';
import { RunActionTaskUseCase, type RunActionResult } from '@/application/use-cases/tasks/workflow/RunActionTask.use-case';
import type { DebugState } from '@/application/services/DebugSessions.service';
import { StartDebugSessionUseCase } from '@/application/use-cases/tasks/debug/StartDebugSession.use-case';
import { ContinueDebugSessionUseCase } from '@/application/use-cases/tasks/debug/ContinueDebugSession.use-case';
import { SetDebugValuesUseCase } from '@/application/use-cases/tasks/debug/SetDebugValues.use-case';
import { GetDebugSessionUseCase } from '@/application/use-cases/tasks/debug/GetDebugSession.use-case';
import { StopDebugSessionUseCase } from '@/application/use-cases/tasks/debug/StopDebugSession.use-case';
import { DebugValuesInSchema, type DebugValuesIn, RunActionInSchema, type RunActionIn } from '@henglosio/shared';
import { RecordWorkflowTaskUseCase } from '@/application/use-cases/tasks/workflow/RecordWorkflowTask.use-case';
import { StopTaskUseCase } from '@/application/use-cases/tasks/StopTask.use-case';
import { StartReplTaskUseCase } from '@/application/use-cases/tasks/repl/StartReplTask.use-case';
import { ListBoardFilesTaskUseCase } from '@/application/use-cases/tasks/fs/ListBoardFilesTask.use-case';
import { ReadBoardFileTaskUseCase } from '@/application/use-cases/tasks/fs/ReadBoardFileTask.use-case';
import { DeleteBoardFileTaskUseCase } from '@/application/use-cases/tasks/fs/DeleteBoardFileTask.use-case';
import { MakeBoardFolderTaskUseCase } from '@/application/use-cases/tasks/fs/MakeBoardFolderTask.use-case';
import { RenameBoardFileTaskUseCase } from '@/application/use-cases/tasks/fs/RenameBoardFileTask.use-case';
import { BOARD_FILE_MAX_BYTES, WriteBoardFileTaskUseCase } from '@/application/use-cases/tasks/fs/WriteBoardFileTask.use-case';
import { ActionRunFailed } from '@/application/errors/Workflow.error';
import { FileInterceptor } from '@nestjs/platform-express';
import { GenerateDriverPairTokenUseCase } from '@/application/use-cases/driver/GenerateDriverPairToken.use-case';
import { MakeDriverPairUseCase } from '@/application/use-cases/driver/MakeDriverPair.use-case';

/**
 * /io/api/v1/drivers — pairing drivers, and everything done on a board
 * through one: compile, flash, Play, ▶ run, debug, record, the REPL and the
 * board's files. The long operations answer a task id at once; their
 * progress comes over the app socket (task:subscribe).
 */
@Controller({ path: 'drivers', version: '1' })
export class DriverController {
	
	constructor(
		private readonly makeDriverPairUseCase: MakeDriverPairUseCase,
		private readonly generateDriverPairToken: GenerateDriverPairTokenUseCase,
		private readonly deleteDriverUseCase: DeleteDriverUseCase,
		private readonly listDriversByUserUseCase: ListDriversByUserUseCase,
		private readonly listDevicesUseCase: ListDevicesUseCase,
		private readonly listVolumesUseCase: ListVolumesUseCase,
		private readonly restartDriverUseCase: RestartDriverUseCase,
		private readonly compileWorkflowTaskUseCase: CompileWorkflowTaskUseCase,
		private readonly releasePortUseCase: ReleasePortUseCase,
		private readonly executeWorkflowTaskUseCase: ExecuteWorkflowTaskUseCase,
		private readonly runActionTaskUseCase: RunActionTaskUseCase,
		private readonly startDebugSessionUseCase: StartDebugSessionUseCase,
		private readonly continueDebugSessionUseCase: ContinueDebugSessionUseCase,
		private readonly setDebugValuesUseCase: SetDebugValuesUseCase,
		private readonly getDebugSessionUseCase: GetDebugSessionUseCase,
		private readonly stopDebugSessionUseCase: StopDebugSessionUseCase,
		private readonly recordWorkflowTaskUseCase: RecordWorkflowTaskUseCase,
		private readonly flashWorkflowTaskUseCase: FlashWorkflowTaskUseCase,
		private readonly stopTaskUseCase: StopTaskUseCase,
		private readonly getPortStatusUseCase: GetPortStatusUseCase,
		private readonly startReplTaskUseCase: StartReplTaskUseCase,
		private readonly listBoardFilesTaskUseCase: ListBoardFilesTaskUseCase,
		private readonly readBoardFileTaskUseCase: ReadBoardFileTaskUseCase,
		private readonly writeBoardFileTaskUseCase: WriteBoardFileTaskUseCase,
		private readonly deleteBoardFileTaskUseCase: DeleteBoardFileTaskUseCase,
		private readonly makeBoardFolderTaskUseCase: MakeBoardFolderTaskUseCase,
		private readonly renameBoardFileTaskUseCase: RenameBoardFileTaskUseCase,
	) {}


	/** GET /drivers/pair-token — a new pair token, for `hio driver login`. */
	@Get("pair-token")
	@UseGuards(AuthGuard)
	async generatePairToken(
		@AuthUser() minimalUser: MinimalUser
	): Promise<PairTokenOut> {

		const pairToken = await this.generateDriverPairToken.execute(minimalUser.userId);

		return {
			pairToken: pairToken.token
		};

	}

	/**
	 * POST /drivers/pair/:pairToken — called by the driver (no user token: the
	 * pair token is the proof). Pairs it, and answers its access and refresh tokens.
	 */
	@Post("pair/:pairToken")
	@Throttle({ default: AUTH_RATE_LIMIT })
	async pairDriver(
		@Param("pairToken") pairToken: string,
		@Body(new ZodValidationPipe(PairDriverInSchema)) body: PairDriverIn,
	): Promise<PairDriverOut> {

		const paired = await this.makeDriverPairUseCase.execute(pairToken, body.name, body.deviceName, body.deviceUser);
		return {
			token: paired.token,
			refreshToken: paired.refreshToken
		};

	}

	/** GET /drivers — the user's drivers, each with whether it's online. */
	@Get()
	@UseGuards(AuthGuard)
	async listDrivers(
		@AuthUser() minimalUser: MinimalUser,
	): Promise<ListDriversByUserOut> {
		const drivers = await this.listDriversByUserUseCase.execute(
			minimalUser.userId,
		);
		return {
			drivers: drivers.map((driver) => ({
				id: driver.id!,
				name: driver.name,
				online: driver.online,
			})),
		};
	}

	/** DELETE /drivers/:id — unpairs it. */
	@Delete(':id')
	@UseGuards(AuthGuard)
	async deleteDriver(
		@Param('id') id: string,
		@AuthUser() authUser: MinimalUser,
	): Promise<DeleteDriverOut> {
		await this.deleteDriverUseCase.execute(authUser.userId, id);
		return { status: 'success' };
	}

	/** POST /drivers/:driverId/restart — restarts the driver process; it comes back online on its own. */
	@Post(':driverId/restart')
	@UseGuards(AuthGuard)
	async restartDriver(
		@Param('driverId') driverId: string,
		@AuthUser() authUser: MinimalUser,
	): Promise<{ status: 'success' }> {
		await this.restartDriverUseCase.execute(authUser.userId, driverId);
		return { status: 'success' };
	}

	/** GET /drivers/:driverId/devices — the boards plugged into the driver's machine. */
	@Get(':driverId/devices')
	@UseGuards(AuthGuard)
	async listDevices(
		@Param('driverId') driverId: string,
		@AuthUser() authUser: MinimalUser,
	): Promise<ListDevicesOut> {

		const deviceList = await this.listDevicesUseCase.execute(authUser.userId, driverId);
		return {
			devices: deviceList.map(device => ({
				port: device.port,
				usbId: device.usbId,
				usbVendor: device.usbVendor
			}))
		}

	}

	/** GET /drivers/:driverId/volumes — the removable drives on the driver's machine, for a UF2 flash target. */
	@Get(':driverId/volumes')
	@UseGuards(AuthGuard)
	async listVolumes(
		@Param('driverId') driverId: string,
		@AuthUser() authUser: MinimalUser,
	): Promise<ListVolumesOut> {

		return { volumes: await this.listVolumesUseCase.execute(authUser.userId, driverId) };

	}

	/** GET /drivers/:driverId/ports/status?port= — what has the board on `port` busy, if anything. */
	@Get(':driverId/ports/status')
	@UseGuards(AuthGuard)
	async portStatus(
		@Param('driverId') driverId: string,
		@Query('port') port: string,
		@AuthUser() authUser: MinimalUser,
	): Promise<PortStatusOut> {
		return this.getPortStatusUseCase.execute(authUser.userId, driverId, port);
	}


	/** POST /drivers/:driverId/ports/release?port= — frees the board on `port`, whatever is holding it. */
	@Post(':driverId/ports/release')
	@UseGuards(AuthGuard)
	async releasePort(
		@Param('driverId') driverId: string,
		@Query('port') port: string,
		@AuthUser() authUser: MinimalUser,
	): Promise<PortStatusOut> {
		return this.releasePortUseCase.execute(authUser.userId, driverId, port);
	}

	/** GET /drivers/:driverId/workflows/:workflowId/compile — starts a compile; answers its task id. */
	@Get(":driverId/workflows/:workflowId/compile")
	@UseGuards(AuthGuard)
	async compileWorkflow(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string
	):Promise<LogsIdOut> {

		const task = await this.compileWorkflowTaskUseCase.execute(authUser.userId, driverId, workflowId);
		return { id: task.id };

	}

	/** POST /drivers/:driverId/workflows/:workflowId/flash — starts writing the board's firmware to `target`; answers its task id. */
	@Post(":driverId/workflows/:workflowId/flash")
	@UseGuards(AuthGuard)
	async flashWorkflow(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Body(new ZodValidationPipe(FlashWorkflowInSchema)) body: FlashWorkflowIn,
	):Promise<LogsIdOut> {

		const task = await this.flashWorkflowTaskUseCase.execute(authUser.userId, driverId, workflowId, body.target);
		return { id: task.id };

	}

	/** POST /drivers/:driverId/workflows/:workflowId/execute — Play: runs the workflow on the board; answers its task id. */
	@Post(":driverId/workflows/:workflowId/execute")
	@UseGuards(AuthGuard)
	async executeWorkflow(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Body(new ZodValidationPipe(ExecuteWorkflowInSchema)) body: ExecuteWorkflowIn,
	):Promise<LogsIdOut> {

		const task = await this.executeWorkflowTaskUseCase.execute(authUser.userId, driverId, workflowId, body.port, body.baudrate);
		return { id: task.id };

	}

	/**
	 * POST /drivers/:driverId/workflows/:workflowId/actions/:actionId/run — the
	 * ▶ on a node: that one action, outside the flow. Answers once the board
	 * did — with the output it ended on and what it published.
	 */
	@Post(":driverId/workflows/:workflowId/actions/:actionId/run")
	@UseGuards(AuthGuard)
	async runAction(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Param("actionId") actionId: string,
		@Body(new ZodValidationPipe(RunActionInSchema)) body: RunActionIn,
	): Promise<RunActionResult> {

		return this.runActionTaskUseCase.execute(authUser.userId, driverId, workflowId, actionId, body.port, body.baudrate, body.context);

	}

	/**
	 * POST /drivers/:driverId/workflows/:workflowId/debug — debug mode, the
	 * flow one action at a time. This starts it: runs Start and pauses (or,
	 * with entryId, arms that trigger and listens for it). Then
	 * /debug/:sessionId/continue runs the next action and pauses again;
	 * /values overwrites what the board holds before the next step; /stop ends it.
	 */
	@Post(":driverId/workflows/:workflowId/debug")
	@UseGuards(AuthGuard)
	async debugStart(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Body(new ZodValidationPipe(DebugStartInSchema)) body: DebugStartIn,
	): Promise<DebugState> {
		return this.startDebugSessionUseCase.execute(authUser.userId, driverId, workflowId, body.port, body.baudrate, body.entryId);
	}

	/** GET /drivers/:driverId/debug/:sessionId — where a debug session stands (to reopen it). */
	@Get(":driverId/debug/:sessionId")
	@UseGuards(AuthGuard)
	debugGet(@AuthUser() authUser: MinimalUser, @Param("sessionId") sessionId: string): DebugState & { workflowId: string; entryId: string; busy: boolean } {
		return this.getDebugSessionUseCase.execute(authUser.userId, sessionId);
	}

	/** POST /drivers/:driverId/debug/:sessionId/continue — runs the next action and pauses. */
	@Post(":driverId/debug/:sessionId/continue")
	@UseGuards(AuthGuard)
	async debugContinue(@AuthUser() authUser: MinimalUser, @Param("sessionId") sessionId: string): Promise<DebugState> {
		return this.continueDebugSessionUseCase.execute(authUser.userId, sessionId);
	}

	/** POST /drivers/:driverId/debug/:sessionId/values — overwrites values the board holds before the next step. */
	@Post(":driverId/debug/:sessionId/values")
	@UseGuards(AuthGuard)
	async debugValues(
		@AuthUser() authUser: MinimalUser,
		@Param("sessionId") sessionId: string,
		@Body(new ZodValidationPipe(DebugValuesInSchema)) body: DebugValuesIn,
	): Promise<{ ok: true }> {
		return this.setDebugValuesUseCase.execute(authUser.userId, sessionId, body.values);
	}

	/** POST /drivers/:driverId/debug/:sessionId/stop — ends the debug session. */
	@Post(":driverId/debug/:sessionId/stop")
	@UseGuards(AuthGuard)
	async debugStop(@AuthUser() authUser: MinimalUser, @Param("sessionId") sessionId: string): Promise<{ stopped: true }> {
		return this.stopDebugSessionUseCase.execute(authUser.userId, sessionId);
	}

	/** POST /drivers/:driverId/workflows/:workflowId/record — stores the workflow on the board; answers its task id. */
	@Post(":driverId/workflows/:workflowId/record")
	@UseGuards(AuthGuard)
	async recordWorkflow(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Body(new ZodValidationPipe(RecordWorkflowInSchema)) body: RecordWorkflowIn,
	):Promise<LogsIdOut> {

		const task = await this.recordWorkflowTaskUseCase.execute(authUser.userId, driverId, workflowId, body.port, body.baudrate);
		return { id: task.id };

	}

	// One stop route per operation type (rather than one generic
	// /tasks/:taskId/stop) so a taskId can only be stopped through the route
	// that matches how it was created — StopTaskUseCase enforces the match.

	/** POST /drivers/:driverId/tasks/compile/:taskId/stop — stops a compile. */
	@Post(":driverId/tasks/compile/:taskId/stop")
	@UseGuards(AuthGuard)
	async stopCompile(
		@AuthUser() authUser: MinimalUser,
		@Param("taskId") taskId: string,
	): Promise<TaskRecord> {

		return this.stopTaskUseCase.execute(authUser.userId, taskId, "compile");

	}

	/** POST /drivers/:driverId/tasks/flash/:taskId/stop — stops a flash. */
	@Post(":driverId/tasks/flash/:taskId/stop")
	@UseGuards(AuthGuard)
	async stopFlash(
		@AuthUser() authUser: MinimalUser,
		@Param("taskId") taskId: string,
	): Promise<TaskRecord> {

		return this.stopTaskUseCase.execute(authUser.userId, taskId, "flash");

	}

	/** POST /drivers/:driverId/tasks/execute/:taskId/stop — stops a Play. */
	@Post(":driverId/tasks/execute/:taskId/stop")
	@UseGuards(AuthGuard)
	async stopExecute(
		@AuthUser() authUser: MinimalUser,
		@Param("taskId") taskId: string,
	): Promise<TaskRecord> {

		return this.stopTaskUseCase.execute(authUser.userId, taskId, "execute");

	}

	/** POST /drivers/:driverId/tasks/record/:taskId/stop — stops a record. */
	@Post(":driverId/tasks/record/:taskId/stop")
	@UseGuards(AuthGuard)
	async stopRecord(
		@AuthUser() authUser: MinimalUser,
		@Param("taskId") taskId: string,
	): Promise<TaskRecord> {

		return this.stopTaskUseCase.execute(authUser.userId, taskId, "record");

	}

	/** Opens a terminal on the board's REPL — the bytes go over the app socket (repl:input / repl:<taskId>). */
	@Post(":driverId/workflows/:workflowId/repl")
	@UseGuards(AuthGuard)
	async startRepl(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Body(new ZodValidationPipe(ReplStartInSchema)) body: ReplStartIn,
	): Promise<LogsIdOut> {

		const task = await this.startReplTaskUseCase.execute(authUser.userId, driverId, workflowId, body.port);
		return { id: task.id };

	}

	/** The board's file tree, with sizes and the free space. */
	@Get(":driverId/workflows/:workflowId/fs")
	@UseGuards(AuthGuard)
	async listBoardFiles(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Query("port") port: string,
	): Promise<FsListOut> {
		return this.listBoardFilesTaskUseCase.execute(authUser.userId, driverId, workflowId, port);
	}

	/** One of the board's files — base64, cut past 128 KB. */
	@Get(":driverId/workflows/:workflowId/fs/file")
	@UseGuards(AuthGuard)
	async readBoardFile(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Query("port") port: string,
		@Query("path") path: string,
	): Promise<FsReadOut> {
		return this.readBoardFileTaskUseCase.execute(authUser.userId, driverId, workflowId, port, path);
	}

	/** Writes a file on the board — an upload, or an edit saved — as multipart `file`. Its folders are made. */
	@Post(":driverId/workflows/:workflowId/fs/file")
	@UseGuards(AuthGuard)
	@UseInterceptors(FileInterceptor('file', { limits: { fileSize: BOARD_FILE_MAX_BYTES, files: 1 } }))
	async writeBoardFile(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Query(new ZodValidationPipe(FsPathInSchema)) query: FsPathIn,
		@UploadedFile() file: Express.Multer.File | undefined,
	): Promise<FsListOut> {
		if (!file) throw new ActionRunFailed("No file uploaded");
		return this.writeBoardFileTaskUseCase.execute(authUser.userId, driverId, workflowId, query.port, query.path, file.buffer);
	}

	/** Deletes a file, or a folder with everything in it. */
	@Post(":driverId/workflows/:workflowId/fs/delete")
	@UseGuards(AuthGuard)
	async deleteBoardFile(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Body(new ZodValidationPipe(FsPathInSchema)) body: FsPathIn,
	): Promise<FsListOut> {
		return this.deleteBoardFileTaskUseCase.execute(authUser.userId, driverId, workflowId, body.port, body.path);
	}

	/** Makes a folder, and the missing ones above it. */
	@Post(":driverId/workflows/:workflowId/fs/mkdir")
	@UseGuards(AuthGuard)
	async makeBoardFolder(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Body(new ZodValidationPipe(FsPathInSchema)) body: FsPathIn,
	): Promise<FsListOut> {
		return this.makeBoardFolderTaskUseCase.execute(authUser.userId, driverId, workflowId, body.port, body.path);
	}

	/** Renames or moves a file or folder — never over something. */
	@Post(":driverId/workflows/:workflowId/fs/rename")
	@UseGuards(AuthGuard)
	async renameBoardFile(
		@AuthUser() authUser: MinimalUser,
		@Param("driverId") driverId: string,
		@Param("workflowId") workflowId: string,
		@Body(new ZodValidationPipe(FsRenameInSchema)) body: FsRenameIn,
	): Promise<FsListOut> {
		return this.renameBoardFileTaskUseCase.execute(authUser.userId, driverId, workflowId, body.port, body.path, body.to);
	}

	/** POST /drivers/:driverId/tasks/repl/:taskId/stop — closes a REPL terminal. */
	@Post(":driverId/tasks/repl/:taskId/stop")
	@UseGuards(AuthGuard)
	async stopRepl(
		@AuthUser() authUser: MinimalUser,
		@Param("taskId") taskId: string,
	): Promise<TaskRecord> {

		return this.stopTaskUseCase.execute(authUser.userId, taskId, "repl");

	}

}
