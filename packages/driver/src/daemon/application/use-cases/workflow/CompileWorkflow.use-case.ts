
import { inject, injectable } from "tsyringe";
import fs from "fs/promises";

import { PackageService as PackageValidator, WorkflowCompileResponse } from "@henglosio/shared";

import { ContainerTunnel } from "../../services/ContainerTunnel.js";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { IContainerRuntime, VolumeBind } from "../../../domain/interfaces/IContainerRuntime.interface.js";
import { PackageService } from "../../services/PackageService.js";
import { WorkflowService } from "../../services/WorkflowService.js";

// Builds the board's runtime in the platform's container (see the platform's
// Runner.build): frozen into a MicroPython firmware for a board that says how
// to build one (firmware.build), else compiled to .mpy for the board's
// firmware version. The result lands on the host in WorkflowService.buildPath,
// where FlashWorkflowUseCase installs it from. Components aren't built here: each
// session (Play, Run, Debug, Record) installs the ones it uses — see
// BoardInstaller — so changing them needs no compile.
// One cache for every workflow's container: what a platform fetches and builds
// once — mpy-cross per MicroPython version, and for a board whose firmware the
// platform builds (the runtime frozen in), MicroPython's source, ESP-IDF and
// its toolchain (a few GB), the build folders and the finished images.
const BUILD_CACHE_VOLUME = "henglosio-build-cache";
const BUILD_CACHE_PATH = "/root/.cache/hio";

// Bumped when the containers' mounts change: an older one is recreated.
const CONTAINER_LAYOUT = "2";

/**
 * Compiles a workflow: in its build container (the platform's image, made once per workflow and
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
	) {}

	// `settings`: the workflow's platform setting overrides, handed to the
	// platform's build through runner.map.json — they change the compiled
	// runtime, not the container (no new packages hash).
	async execute(workflowId: string, ctx: TaskContext, settings: Record<string, number> = {}): Promise<WorkflowCompileResponse> {

		if (!await this.workflowService.exists(workflowId)) {
			throw new Error("Workflow not found.");
		}

		const workflowMetadata = await this.workflowService.getMetadata(workflowId);
		if (!workflowMetadata.board || !workflowMetadata.platform) {
			throw new Error("No package found.");
		}

		const cachedBoard = await this.packageService.getPackage(workflowMetadata.board.name, workflowMetadata.board.version);
		if (!cachedBoard) throw new Error("Board package not found.");

		const cachedPlatform = await this.packageService.getPackage(workflowMetadata.platform.name, workflowMetadata.platform.version);
		if (!cachedPlatform) throw new Error("Platform package not found.");

		if (!await this.packageValidator.validateBoard(cachedBoard.path)) throw new Error("Invalid board package.");

		// The platform builds itself: its container, its output folder.
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
			if (existingHash !== packagesHash || existingLayout !== CONTAINER_LAYOUT) {
				await this.containerService.removeContainer(containerName);
			}
		}

		if (!await this.containerService.containerExists(containerName)) {

			const image = platform.build.image;
			const auth = { registry: image.registry, username: image.username, password: image.password };
			if (!await this.containerService.imageExists(image.name, auth)) {
				await this.containerService.pullImage(image.name, auth, (msg) => ctx.info(msg));
			}

			const volumes: VolumeBind[] = [
				{ hostPath: cachedBoard.path,    containerPath: "/workspace/packages/board",    readOnly: true },
				{ hostPath: cachedPlatform.path, containerPath: "/workspace/packages/platform", readOnly: true },
				{ hostPath: buildPath,           containerPath: platform.build.output },
				{ volume: BUILD_CACHE_VOLUME,    containerPath: BUILD_CACHE_PATH },
			];

			await this.containerService.createContainer({
				name: containerName,
				image,
				cmd: ["sleep", "infinity"],
				volumes,
				labels: { "henglosio.packages-hash": packagesHash, "henglosio.layout": CONTAINER_LAYOUT },
				network:    { mode: "bridge" },
				extraHosts: ["host.docker.internal:host-gateway"],
			});
		}

		await this.containerService.startContainer(containerName);

		const runnerMap = {
			board: "/workspace/packages/board",
			platform: "/workspace/packages/platform",
			// The runtime only — sessions install the components (BoardInstaller).
			components: [],
			settings,
		};

		await this.containerService.copyToContainer(
			containerName,
			"/workspace/runner.map.json",
			Buffer.from(JSON.stringify(runnerMap, null, 2)),
		);

		const { sessionId, url } = this.containerTunnel.createSession(ctx.taskId, (payload) => {
			if (payload.type === "data") ctx.log("stdout", payload.data);
			else ctx.log("stderr", String(payload.data));
		});

		try {
			ctx.progress("build");
			const result = await this.containerService.execCommand(containerName, ["sh", "-c", "npx hio build --map runner.map.json ."], {
				workingDir: "/workspace",
				env: { HIO_CALLBACK_URL: url },
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
