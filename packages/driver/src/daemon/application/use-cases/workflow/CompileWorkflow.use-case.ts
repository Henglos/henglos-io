
import { inject, injectable } from "tsyringe";
import { createHash } from "crypto";
import fs from "fs/promises";

import { PackageService as PackageValidator, type SyncPackage, WorkflowCompileResponse } from "@henglosio/shared";

import { ContainerTunnel } from "../../services/ContainerTunnel.service.js";
import { RunnerHost } from "../../services/RunnerHost.service.js";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { IContainerRuntime, VolumeBind } from "../../../domain/interfaces/IContainerRuntime.interface.js";
import { PackageService } from "../../services/PackageService.service.js";
import { WorkflowService } from "../../services/WorkflowService.service.js";
import { SyncWorkflowUseCase } from "./SyncWorkflow.use-case.js";

// Builds the board's runtime in the board's image (see the platform's
// Runner.build): frozen into a MicroPython firmware when the board's script
// builds one, else compiled to .mpy for the board's firmware version. The result lands on the host in WorkflowService.buildPath,
// where FlashWorkflowUseCase installs it from. Components aren't built here: each
// session (Play, Run, Debug, Record) installs the ones it uses — see
// BoardInstaller — so changing them needs no compile.
// One cache per image, shared by the containers that run it: what a build fetches
// once — mpy-cross per MicroPython version and, for a board whose script builds
// its firmware, MicroPython's source, its toolchain (a few GB), the build folders
// and the finished images. Per image: any image can write to it, and what one
// leaves there must not end up in another's firmware.
const buildCacheVolume = (image: string) => `henglosio-build-cache-${createHash("sha256").update(image).digest("hex").slice(0, 16)}`;
const BUILD_CACHE_PATH = "/root/.cache/hio";

// Bumped when the containers' mounts change: an older one is recreated.
const CONTAINER_LAYOUT = "3";

/**
 * Compiles a workflow: in its build container (the board's image, made once per workflow and
 * kept), `hio build` runs the platform's Runner with the workflow's board, platform and
 * components mounted; the output is kept for the board.
 */
@injectable()
export class CompileWorkflowUseCase {

	private readonly packageValidator = new PackageValidator();

	constructor(
		@inject("IContainerRuntime") private readonly containerService: IContainerRuntime,
		private readonly containerTunnel: ContainerTunnel,
		private readonly workflowService: WorkflowService,
		private readonly packageService: PackageService,
		private readonly runnerHost: RunnerHost,
		private readonly syncWorkflow: SyncWorkflowUseCase,
	) {}

	// `settings`: the workflow's platform setting overrides, handed to the
	// platform's build through runner.map.json — they change the compiled
	// runtime, not the container (no new packages hash). `options`: what the
	// workflow picked for its board's options, for the board's firmware script —
	// runner.map.json stays in the container, so the flash gets them too.
	// `packages`: the workflow's, synced first (a workflow made or changed since
	// this driver connected) — absent from an older hosting.
	async execute(workflowId: string, ctx: TaskContext, settings: Record<string, number> = {}, options: Record<string, string | number | boolean> = {}, packages?: SyncPackage[]): Promise<WorkflowCompileResponse> {

		if (packages) {
			ctx.progress("sync");
			// What isn't cached yet is installed; one that can't be fails the
			// compile with why (SyncWorkflowUseCase records it too).
			await this.syncWorkflow.execute(workflowId, packages, {
				reply: (result) => ctx.info(result.data),
				fail: (error) => ctx.log("stderr", error),
			});
		}

		// A cancel only reaches the build once it runs in the container (its exec
		// takes the signal): the steps before it — sync, image pull — check it in
		// between, so a cancelled compile doesn't go on to build.
		ctx.signal.throwIfAborted();

		if (!await this.workflowService.exists(workflowId)) {
			throw new Error("Workflow not found.");
		}

		const workflowMetadata = await this.workflowService.getMetadata(workflowId);
		if (!workflowMetadata.board || !workflowMetadata.platform) {
			const missing = !workflowMetadata.board ? "board" : "platform";
			throw new Error(workflowMetadata.syncError
				? `This workflow's ${missing} package isn't installed on this driver: ${workflowMetadata.syncError}`
				: `This workflow's ${missing} package isn't installed on this driver — restart it to sync again.`);
		}

		const cachedBoard = await this.packageService.getPackage(workflowMetadata.board.name, workflowMetadata.board.version);
		if (!cachedBoard) throw new Error("Board package not found.");

		const cachedPlatform = await this.packageService.getPackage(workflowMetadata.platform.name, workflowMetadata.platform.version);
		if (!cachedPlatform) throw new Error("Platform package not found.");

		const board = await this.packageValidator.validateBoard(cachedBoard.path);
		if (!board) throw new Error("Invalid board package.");

		// The platform builds itself, in the board's image: its output folder.
		const platform = await this.packageValidator.validatePlatform(cachedPlatform.path);
		if (!platform) throw new Error("Invalid platform package.");

		const containerName = `henglosio-${workflowId}`;
		const packagesHash = this.workflowService.computePackagesHash(workflowMetadata.board, workflowMetadata.platform);

		// The build output is mounted from the host — clear it, so nothing of
		// an earlier build (a removed component) gets uploaded.
		const buildPath = this.workflowService.buildPath(workflowId);
		await fs.rm(buildPath, { recursive: true, force: true });
		await fs.mkdir(buildPath, { recursive: true });

		if (await this.containerService.containerExists(containerName)) {
			const existingHash = await this.containerService.getContainerLabel(containerName, "henglosio.packages-hash");
			const existingLayout = await this.containerService.getContainerLabel(containerName, "henglosio.layout");
			const existingImage = await this.containerService.getContainerLabel(containerName, "henglosio.image");
			if (existingHash !== packagesHash || existingLayout !== CONTAINER_LAYOUT || existingImage !== board.firmware.image) {
				await this.containerService.removeContainer(containerName);
			}
		}

		if (!await this.containerService.containerExists(containerName)) {

			const image = { name: board.firmware.image };
			ctx.info(`Building in ${image.name}, with ${board.name}'s ${board.firmware.script}.`);
			if (!await this.containerService.imageExists(image.name, {})) {
				await this.containerService.pullImage(image.name, {}, (msg) => ctx.info(msg));
				ctx.signal.throwIfAborted();
			}

			const volumes: VolumeBind[] = [
				{ hostPath: cachedBoard.path,    containerPath: "/workspace/packages/board",    readOnly: true },
				{ hostPath: cachedPlatform.path, containerPath: "/workspace/packages/platform", readOnly: true },
				{ hostPath: buildPath,           containerPath: platform.build.output },
				{ volume: buildCacheVolume(image.name), containerPath: BUILD_CACHE_PATH },
			];

			await this.containerService.createContainer({
				name: containerName,
				image,
				cmd: ["sleep", "infinity"],
				volumes,
				labels: { "henglosio.packages-hash": packagesHash, "henglosio.layout": CONTAINER_LAYOUT, "henglosio.image": image.name },
				network:    { mode: "bridge" },
				extraHosts: ["host.docker.internal:host-gateway"],
			});
		}

		ctx.signal.throwIfAborted();
		await this.containerService.startContainer(containerName);

		const runnerMap = {
			board: "/workspace/packages/board",
			platform: "/workspace/packages/platform",
			// The runtime only — sessions install the components (BoardInstaller).
			components: [],
			settings,
			options,
		};

		await this.containerService.copyToContainer(
			containerName,
			"/workspace/runner.map.json",
			Buffer.from(JSON.stringify(runnerMap, null, 2)),
		);

		const { sessionId, url, token } = this.containerTunnel.createSession(ctx.taskId, (payload) => {
			if (payload.type === "data") ctx.log("stdout", payload.data);
			else if (payload.type === "phase") ctx.progress(payload.phase);
			else ctx.log("stderr", String(payload.data));
		});

		try {
			ctx.progress("build");
			// This driver's runner host, injected — or the image's `hio` (RunnerHost).
			const command = await this.runnerHost.command(containerName, ["build", "--map", "runner.map.json", "."]);
			const result = await this.containerService.execCommand(containerName, command, {
				workingDir: "/workspace",
				env: { HIO_CALLBACK_URL: url, HIO_CALLBACK_TOKEN: token, HIO_RUNNER_PHASES: "1" },
				signal: ctx.signal,
				onLog: (data) => ctx.log("stdout", data),
			});
			// The platform's build failing ends the command, not the stream — its
			// exit code is the only sign.
			if (result.exitCode !== 0) throw new Error(`The platform's build failed (exit code ${result.exitCode}) — see the log above.`);
		} finally {
			this.containerTunnel.destroySession(sessionId);
			await this.containerService.stopContainer(containerName).catch(() => {});
		}

		return { compiled: true }

	}

}
