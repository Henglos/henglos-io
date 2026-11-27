import fs from "fs/promises";
import path from "path";
import { inject, injectable } from "tsyringe";
import { ContainerTunnel } from "../../services/ContainerTunnel.service.js";
import { RunnerHost } from "../../services/RunnerHost.service.js";
import { IContainerRuntime } from "../../../domain/interfaces/IContainerRuntime.interface.js";
import { WorkflowService } from "../../services/WorkflowService.service.js";
import { FlashBrokerService } from "../../services/FlashBroker.service.js";
import { UF2Drives } from "../../services/UF2Drives.service.js";
import { ReplError, ReplSession } from "../../services/ReplSession.service.js";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { WorkflowNotCompiled, WorkflowNotFound } from "../../errors/Workflow.error.js";
import { WorkflowStateService } from "../../services/WorkflowStateService.service.js";
import { type FlashTarget } from "@henglosio/shared";
import { BUILD_INFO, BUILD_OUTPUT, FIRMWARE_INFO, type FirmwareInfo } from "@henglosio/runner";
import { SerialPort } from "serialport";

// esptool's speed once connected — the tunnel opens the port at the REPL's
// speed, esptool raises it over RFC2217.
const FIRMWARE_FLASH_BAUDRATE = 460800;

// Where the container reaches the host's tunnels.
const CONTAINER_HOST = "host.docker.internal";

// How long a board written by UF2 gets for its serial port to come back.
const PORT_RETURN_TIMEOUT_MS = 20_000;

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
//      writes its firmware first (`hio flash`, the board's script over the USB
//      tunnel);
//   2. the build (the runtime + main.py/boot.py) is uploaded over the REPL,
//      replacing the runtime that was there — the components are installed by
//      each session (BoardInstaller), not here;
//   3. a soft reset starts main.py.
@injectable()
export class FlashWorkflowUseCase {

	constructor(
		@inject("IContainerRuntime")
		private readonly containerService: IContainerRuntime,
		private readonly containerTunnel: ContainerTunnel,
		private readonly workflowService: WorkflowService,
		private readonly workflowStateService: WorkflowStateService,
		private readonly runnerHost: RunnerHost,
		private readonly flashBroker: FlashBrokerService,
		private readonly drives: UF2Drives,
	) {}

	// `target`: where and how the studio has the firmware written. Its `port` is
	// the board's REPL either way — checked before, the runtime installed after.
	async execute(
		workflowId: string,
		target: FlashTarget,
		ctx: TaskContext,
	): Promise<boolean> {
		if (!(await this.workflowService.exists(workflowId)))
			throw new WorkflowNotFound;

		if (!(await this.workflowStateService.isCompiled(workflowId)))
			throw new WorkflowNotCompiled;

		const buildPath = this.workflowService.buildPath(workflowId);
		// BUILD_INFO is for the driver (MpyCompiler), not the board.
		const files = (await listFiles(buildPath)).filter(file => file !== BUILD_INFO);

		const firmware = await readFirmwareInfo(buildPath);
		if (firmware) return this.installFrozen(workflowId, target, ctx, buildPath, files, firmware);

		let port = target.port;

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
			await this.noRepl(target, err, ctx);
		}

		if (!running || running[0] !== wanted) {
			ctx.info(running
				? `The board imports mpy v${running[0]}, this build is v${wanted} — flashing MicroPython...`
				: "No MicroPython on the board — flashing it...");
			await repl?.close(false);
			port = await this.flashFirmware(workflowId, target, ctx);
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
		target: FlashTarget,
		ctx: TaskContext,
		buildPath: string,
		files: string[],
		firmware: FirmwareInfo,
	): Promise<boolean> {

		const startMs = Date.now();
		let port = target.port;

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
			await this.noRepl(target, err, ctx);
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
			port = await this.flashFirmware(workflowId, target, ctx, { image: `${BUILD_OUTPUT}/${firmware.image}`, erase });
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

	// No REPL answered on the target's port. A board that opened but didn't
	// answer gets its firmware written; a port that doesn't open at all is a
	// connection problem (in use, adapter stuck, unplugged) — erasing the flash
	// over it would wipe a board that was fine. Unless the target is a UF2
	// drive that's there: the board sits in its bootloader, with no serial port.
	private async noRepl(target: FlashTarget, err: unknown, ctx: TaskContext): Promise<void> {
		if (err instanceof ReplError) {
			ctx.info(`No answer from a REPL on ${target.port}: ${err.message}`);
			return;
		}
		if (target.method === "uf2" && await this.drives.find(target.volume)) {
			ctx.info(`${target.port} doesn't open, but the ${target.volume} drive is there — the board is in its bootloader.`);
			return;
		}
		throw portError(target.port, err);
	}

	// `hio flash` in the board's container: its script writes a MicroPython
	// firmware by `target` (through the driver's broker) — its stock one, or
	// `firmware.image` (a path in the container) — erasing the flash first unless
	// `firmware.erase` is false. Resolves to the port the board's REPL is on now.
	private async flashFirmware(workflowId: string, target: FlashTarget, ctx: TaskContext, firmware?: { image: string; erase: boolean }): Promise<string> {

		const containerName = `henglosio-${workflowId}`;
		// The ports before: a board written by UF2 restarts, and its serial port may
		// come back under another name.
		const before = target.method === "uf2" ? await SerialPort.list() : [];
		// How the board's script reaches the board — HIO_BROKER_URL.
		const broker = this.flashBroker.createSession({ target, tunnelHost: CONTAINER_HOST });
		const { sessionId, url, brokerUrl, token } = this.containerTunnel.createSession(ctx.taskId, (payload) => {
			if (payload.type === "data") ctx.log("stdout", payload.data);
			else if (payload.type === "phase") ctx.progress(payload.phase);
			else ctx.log("stderr", String(payload.data));
		}, broker);

		// isCompiled() already guarantees the container exists — it just might be stopped.
		await this.containerService.startContainer(containerName);

		try {
			ctx.progress("firmware");
			// This driver's runner host, injected — or the image's `hio` (RunnerHost).
			const command = await this.runnerHost.command(containerName, [
				"flash", "--map", "runner.map.json",
				"--method", target.method,
				"--port", target.port,
				"--baudrate", String(target.method === "serial" ? target.baudrate ?? FIRMWARE_FLASH_BAUDRATE : FIRMWARE_FLASH_BAUDRATE),
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
						HIO_BROKER_URL: brokerUrl,
						HIO_RUNNER_PHASES: "1",
						HIO_FLASH_ERASE: firmware?.erase === false ? "0" : "1",
					},
					signal: ctx.signal,
					onLog: (data) => ctx.log("stdout", data),
				},
			);
			if (result.exitCode !== 0) throw new Error(`Writing the firmware failed (exit code ${result.exitCode}) — see the log above.`);
		} finally {
			this.containerTunnel.destroySession(sessionId);
			await broker.destroy();
			await this.containerService.stopContainer(containerName).catch(() => {});
		}

		return target.method === "uf2" ? this.portAfterUF2(target, before, ctx) : target.port;

	}

	// The board's serial port once the UF2 write restarted it: the target's port
	// when it comes back, or else a port that wasn't there before — the same
	// USB ids as the target's, when it was there to compare with.
	private async portAfterUF2(target: FlashTarget, before: Awaited<ReturnType<typeof SerialPort.list>>, ctx: TaskContext): Promise<string> {
		const original = before.find(p => p.path === target.port);
		const until = Date.now() + PORT_RETURN_TIMEOUT_MS;
		for (;;) {
			const ports = await SerialPort.list();
			if (ports.some(p => p.path === target.port)) return target.port;
			const fresh = ports.filter(p => !before.some(b => b.path === p.path));
			const match = original?.vendorId
				? fresh.find(p => p.vendorId === original.vendorId && p.productId === original.productId)
				: fresh.length === 1 ? fresh[0] : undefined;
			if (match) {
				ctx.info(`The board came back on ${match.path}, not ${target.port}.`);
				return match.path;
			}
			if (Date.now() >= until) throw new Error(`The board didn't come back on ${target.port} after the UF2 write — pick its serial port and flash again.`);
			await new Promise(resolve => setTimeout(resolve, 500));
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
