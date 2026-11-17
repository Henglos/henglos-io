import fs from "fs/promises";
import path from "path";
import { inject, injectable } from "tsyringe";
import { ContainerTunnel } from "../../services/ContainerTunnel.service.js";
import { RunnerHost } from "../../services/RunnerHost.service.js";
import { IContainerRuntime } from "../../../domain/interfaces/IContainerRuntime.interface.js";
import { WorkflowService } from "../../services/WorkflowService.service.js";
import { USBTunnel } from "../../services/USBTunnel.service.js";
import { ReplError, ReplSession, REPL_BAUDRATE } from "../../services/ReplSession.service.js";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { WorkflowNotCompiled, WorkflowNotFound } from "../../errors/Workflow.error.js";
import { WorkflowStateService } from "../../services/WorkflowStateService.service.js";
import { PackageService } from "../../services/PackageService.service.js";
import { PackageService as PackageValidator } from "@henglosio/shared";

// esptool's speed once connected — the tunnel opens the port at the REPL's
// speed, esptool raises it over RFC2217.
const FIRMWARE_FLASH_BAUDRATE = 460800;

// What the platform's build left when the board's script froze the runtime into
// its firmware (the platform's runner/build.ts, FirmwareInfo).
type FirmwareInfo = { buildId: string; micropython: string; image: string };
const FIRMWARE_INFO = "firmware.json";

// The runtime's folders on the board's filesystem — the runtime and the sdk
// components import. Cleared before writing: a stale copy (an older platform's,
// or one a frozen firmware now replaces) comes first on sys.path.
const RUNTIME_DIRS = ["/hio", "/henglosio"];

// Installs a compiled workflow on the board. Two kinds of build:
//
// The runtime frozen into the board's firmware (firmware.json — a board whose
// manifest has firmware.build):
//   1. the board's frozen build (hio_build.BUILD_ID) is checked: only another
//      one gets the firmware written — and the flash erased first only when
//      the board runs no MicroPython or another version: over the same one,
//      the filesystem (components, files, the stored program) stays;
//   2. a runtime left on the filesystem by an older platform is removed — it
//      would shadow the frozen one — and main.py/boot.py are uploaded;
//   3. a soft reset starts main.py.
//
// The runtime as .mpy files:
//   1. the board must run a MicroPython that imports this build's .mpy files —
//      if it doesn't (fresh board, other version), the board's container
//      writes its firmware first (Runner.flash, the board's script over the USB
//      tunnel);
//   2. the build (the runtime + main.py/boot.py) is uploaded over the REPL,
//      replacing the runtime that was there — the components are installed by
//      each session (BoardInstaller), not here;
//   3. a soft reset starts main.py.
@injectable()
export class FlashWorkflowUseCase {

	private readonly packageValidator = new PackageValidator();

	constructor(
		@inject("IContainerRuntime")
		private readonly containerService: IContainerRuntime,
		private readonly containerTunnel: ContainerTunnel,
		private readonly workflowService: WorkflowService,
		private readonly workflowStateService: WorkflowStateService,
		private readonly usbTunnel: USBTunnel,
		private readonly packageService: PackageService,
		private readonly runnerHost: RunnerHost,
	) {}

	async execute(
		workflowId: string,
		port: string,
		_baudrate: number,
		ctx: TaskContext,
	): Promise<boolean> {
		if (!(await this.workflowService.exists(workflowId)))
			throw new WorkflowNotFound;

		if (!(await this.workflowStateService.isCompiled(workflowId)))
			throw new WorkflowNotCompiled;

		const buildPath = this.workflowService.buildPath(workflowId);
		const files = await listFiles(buildPath);

		const firmware = await readFirmwareInfo(buildPath);
		if (firmware) return this.installFrozen(workflowId, port, ctx, buildPath, files, firmware);

		const wanted = await buildMpyVersion(buildPath, files);

		const startMs = Date.now();

		// ── 1. MicroPython ───────────────────────────────────────────────────
		ctx.progress("check");

		// Only a board that *answers* without a REPL gets its firmware
		// rewritten. A port that doesn't even open is a connection problem
		// (in use, adapter stuck, unplugged) — erasing the flash over it would
		// wipe a board that was fine.
		let repl: ReplSession | null = null;
		let running: [number, number] | null = null;
		try {
			repl = await ReplSession.open(port);
			running = await repl.mpyVersion();
		} catch (err) {
			if (!(err instanceof ReplError)) throw portError(port, err);
			ctx.info(`No answer from a REPL on ${port}: ${err.message}`);
		}

		if (!running || running[0] !== wanted) {
			ctx.info(running
				? `The board imports mpy v${running[0]}, this build is v${wanted} — flashing MicroPython...`
				: "No MicroPython on the board — flashing it...");
			await repl?.close(false);
			await this.flashFirmware(workflowId, port, ctx);
			repl = await ReplSession.open(port, 15000);
		}

		// ── 2. Upload ────────────────────────────────────────────────────────
		let restart = false;
		try {

			ctx.progress("upload", 0);
			// The runtime only: /components and /files are what sessions installed
			// (BoardInstaller) — kept, so the next Play has nothing to resend.
			for (const dir of RUNTIME_DIRS) await repl!.remove(dir);

			const folders = [...new Set(files.flatMap(file => parentFolders(file)))].sort((a, b) => a.length - b.length);
			await repl!.mkdirs(folders.map(folder => `/${folder}`));

			for (let i = 0; i < files.length; i++) {
				const file = files[i]!;
				await repl!.writeFile(`/${file}`, await fs.readFile(path.join(buildPath, file)));
				ctx.progress("upload", Math.round(((i + 1) / files.length) * 100));
			}

			restart = true;

		} finally {
			// ── 3. Start ─────────────────────────────────────────────────────
			await repl!.close(restart);
		}

		ctx.info(`Installed ${files.length} file(s) on ${port} in ${Date.now() - startMs}ms.`);
		return true;
	}

	// The runtime is in the firmware: write it when the board has another build,
	// then leave only main.py/boot.py on the filesystem next to the components.
	private async installFrozen(
		workflowId: string,
		port: string,
		ctx: TaskContext,
		buildPath: string,
		files: string[],
		firmware: FirmwareInfo,
	): Promise<boolean> {

		const startMs = Date.now();

		// ── 1. Firmware ───────────────────────────────────────────────────────
		ctx.progress("check");

		// What the board runs: its MicroPython and the build frozen into it ("" for
		// none — the official image, or an older platform's). A port that doesn't
		// open at all is a connection problem, not a board to rewrite.
		let repl: ReplSession | null = null;
		let running: { micropython: string; buildId: string } | null = null;
		try {
			repl = await ReplSession.open(port);
			const out = await repl.exec([
				"import os",
				"try:",
				"    import hio_build",
				"    _b = hio_build.BUILD_ID",
				"except ImportError:",
				"    _b = ''",
				"print(os.uname().release, _b)",
			].join("\n"));
			const [micropython = "", buildId = ""] = (out.trim().split("\n").at(-1) ?? "").split(" ");
			running = { micropython, buildId };
		} catch (err) {
			if (!(err instanceof ReplError)) throw portError(port, err);
			ctx.info(`No answer from a REPL on ${port}: ${err.message}`);
		}

		if (running?.buildId === firmware.buildId) {
			ctx.info(`The board already runs this runtime (build ${firmware.buildId}).`);
		} else {
			// Another MicroPython (or none): its filesystem and .mpy files don't carry
			// over — erased. The same one: only the firmware changes.
			const erase = running?.micropython !== firmware.micropython;
			ctx.info(!running
				? `No MicroPython on the board — flashing MicroPython ${firmware.micropython} with the runtime...`
				: erase
					? `The board runs MicroPython ${running.micropython}, this build is ${firmware.micropython} — erasing and flashing...`
					: `Flashing the runtime (build ${firmware.buildId}) — the board's files stay...`);
			await repl?.close(false);
			repl = null;
			const output = await this.platformOutput(workflowId);
			await this.flashFirmware(workflowId, port, ctx, { image: `${output}/${firmware.image}`, erase });
			repl = await ReplSession.open(port, 15000);
		}

		// ── 2. Upload ─────────────────────────────────────────────────────────
		let restart = false;
		try {

			ctx.progress("upload", 0);
			// A runtime on the filesystem (an older platform's) comes first on
			// sys.path — it would run instead of the frozen one.
			for (const dir of RUNTIME_DIRS) await repl!.remove(dir);

			const entries = files.filter(file => file !== FIRMWARE_INFO && file !== firmware.image);
			// Their folders first (components/ for components/__init__.py): a
			// freshly erased board has none, and writing into one that doesn't
			// exist fails with ENOENT.
			const folders = [...new Set(entries.flatMap(file => parentFolders(file)))].sort((a, b) => a.length - b.length);
			await repl!.mkdirs(folders.map(folder => `/${folder}`));

			for (let i = 0; i < entries.length; i++) {
				const file = entries[i]!;
				await repl!.writeFile(`/${file}`, await fs.readFile(path.join(buildPath, file)));
				ctx.progress("upload", Math.round(((i + 1) / entries.length) * 100));
			}

			restart = true;

		} finally {
			// ── 3. Start ──────────────────────────────────────────────────────
			await repl!.close(restart);
		}

		ctx.info(`Installed the runtime (build ${firmware.buildId}) on ${port} in ${Date.now() - startMs}ms.`);
		return true;

	}

	// Where the platform's container sees the build output (its manifest's build.output).
	private async platformOutput(workflowId: string): Promise<string> {
		const metadata = await this.workflowService.getMetadata(workflowId);
		const cached = metadata.platform && await this.packageService.getPackage(metadata.platform.name, metadata.platform.version);
		const platform = cached && await this.packageValidator.validatePlatform(cached.path);
		if (!platform) throw new Error("Platform package not found — compile the workflow again.");
		return platform.build.output;
	}

	// Runner.flash in the board's container: its script writes a MicroPython
	// firmware through the RFC2217 tunnel to `port` — its stock one, or
	// `firmware.image` (a path in the container) — erasing the flash first unless
	// `firmware.erase` is false.
	private async flashFirmware(workflowId: string, port: string, ctx: TaskContext, firmware?: { image: string; erase: boolean }): Promise<void> {

		const containerName = `henglosio-${workflowId}`;
		const usbTunnelPort = await this.usbTunnel.connect(port, REPL_BAUDRATE);
		const { sessionId, url, token } = this.containerTunnel.createSession(ctx.taskId, (payload) => {
			if (payload.type === "data") ctx.log("stdout", payload.data);
			else if (payload.type === "phase") ctx.progress(payload.phase);
			else ctx.log("stderr", String(payload.data));
		});

		// isCompiled() already guarantees the container exists — it just might be stopped.
		await this.containerService.startContainer(containerName);

		try {
			ctx.progress("firmware");
			// This driver's runner host, injected — or the image's `hio` (RunnerHost).
			const command = await this.runnerHost.command(containerName, [
				"flash", "--map", "runner.map.json",
				"--port", port,
				"--baudrate", String(FIRMWARE_FLASH_BAUDRATE),
				...(firmware ? ["--firmware", firmware.image] : []),
				".",
			]);
			const result = await this.containerService.execCommand(
				containerName,
				command,
				{
					workingDir: "/workspace",
					env: {
						HIO_CALLBACK_URL: url,
						HIO_CALLBACK_TOKEN: token,
						HIO_RUNNER_PHASES: "1",
						USB_TUNNEL_HOST: "host.docker.internal",
						USB_TUNNEL_PORT: String(usbTunnelPort),
						USB_PORT: port,
						HIO_FLASH_ERASE: firmware?.erase === false ? "0" : "1",
					},
					signal: ctx.signal,
					onLog: (data) => ctx.log("stdout", data),
				},
			);
			if (result.exitCode !== 0) throw new Error(`Writing the firmware failed (exit code ${result.exitCode}) — see the log above.`);
		} finally {
			this.containerTunnel.destroySession(sessionId);
			await this.usbTunnel.disconnect(port).catch(() => {});
			await this.containerService.stopContainer(containerName).catch(() => {});
		}

	}
}

// The port couldn't be opened at all — with what to do about it.
function portError(port: string, err: unknown): Error {
	const message = err instanceof Error ? err.message : String(err);
	const hint = /error code 31\b/.test(message)
		? "the USB-serial adapter stopped responding (Windows error 31) — unplug the board and plug it back in"
		: /access denied|error code 5\b|busy/i.test(message)
			? "another program has the port open — close any serial monitor, mpremote or IDE using it"
			: "check that the board is plugged in and the port is right";
	return new Error(`Couldn't open ${port}: ${message} — ${hint}.`);
}

// Every file under `root`, as "/"-separated paths relative to it.
async function listFiles(root: string, relative = ""): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
		const child = relative ? `${relative}/${entry.name}` : entry.name;
		if (entry.isDirectory()) files.push(...await listFiles(root, child));
		else files.push(child);
	}
	return files;
}

// The build's firmware.json — null for a build that put the runtime in .mpy files.
async function readFirmwareInfo(root: string): Promise<FirmwareInfo | null> {
	try {
		return JSON.parse(await fs.readFile(path.join(root, FIRMWARE_INFO), "utf-8")) as FirmwareInfo;
	} catch {
		return null;
	}
}

// "a/b/c.mpy" -> ["a", "a/b"]
function parentFolders(file: string): string[] {
	const parts = file.split("/").slice(0, -1);
	return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

// The .mpy version the build was compiled for, from a .mpy header ('M',
// version, ...). Bytecode only needs this to match the board's — the
// sub-version is about native code, which this build has none of.
async function buildMpyVersion(root: string, files: string[]): Promise<number> {
	const mpy = files.find(file => file.endsWith(".mpy"));
	if (!mpy) throw new Error("The build has no .mpy files — compile the workflow again.");
	const header = (await fs.readFile(path.join(root, mpy))).subarray(0, 2);
	if (header[0] !== 0x4d) throw new Error(`Not a .mpy file: ${mpy}`);
	return header[1]!;
}
