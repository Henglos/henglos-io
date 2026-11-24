import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { exit } from "process";
import { fileURLToPath } from "url";
import type { Command } from "commander";
import { PackageService } from "@henglosio/shared";
import { resolvePlatform } from "../core/platform.js";
import type { RunnerMap } from "../core/runner.js";

const WORKSPACE = "/workspace";
// The runner host and runner.map.json, mounted read-only.
const HOST_DIR = "/opt/henglosio";
const CACHE_VOLUME = "henglosio-firmware-cache";

/**
 * Registers `hio firmware build|flash [board]`: runs a board's firmware script in
 * its image, the way the driver does, to try it without the studio.
 *
 * The platform the board depends on is fetched here (HIO_REGISTRY_URL), and the
 * board and the platform are mounted in the container, where this `hio`'s runner
 * host (dist/runner-host.mjs) runs them — the image needs no `hio` of its own.
 *
 * @param cli The `hio` program to add the command to.
 */
export const registerFirmwareCommand = (cli: Command) => {
	const firmwareCommand = cli.command("firmware <action> [board]");
	firmwareCommand.description("try a board's firmware script in its image — action: build or flash");
	firmwareCommand.option("--output <path>", "where the build goes", "hio-build");
	firmwareCommand.option("--port <url>", "flash: serial port the container can reach (rfc2217://…)");
	firmwareCommand.option("--firmware <path>", "flash: firmware image, in the output folder (default: the board's stock firmware)");
	firmwareCommand.option("--baudrate <rate>", "flash: baud rate", "460800");
	firmwareCommand.action(async (action: string, boardArg: string | undefined, options: { output: string; port?: string; firmware?: string; baudrate: string }) => {

		if (action !== "build" && action !== "flash") {
			console.error(`[-] Unknown action: ${action} — use build or flash.`);
			exit(1);
		}
		if (action === "flash" && !options.port) {
			console.error("[-] --port is required to flash.");
			exit(1);
		}

		const boardDir = path.resolve(process.cwd(), boardArg ?? ".");
		const board = await new PackageService().validateBoard(boardDir);
		if (!board) {
			console.error(`[-] Invalid board package at ${boardDir} — run hio lint for why.`);
			exit(1);
		}

		// This `hio`'s runner host — dist/runner-host.mjs, next to this code once built.
		const host = path.join(path.dirname(fileURLToPath(import.meta.url)), "runner-host.mjs");
		if (!await fs.access(host).then(() => true, () => false)) {
			console.error(`[-] No runner host at ${host} — build the CLI first (pnpm build).`);
			exit(1);
		}

		const platform = await resolvePlatform(board.dependences.platform);

		// The runner host and the map, in a folder of their own.
		const hostDir = await fs.mkdtemp(path.join(os.tmpdir(), "hio-firmware-"));
		await fs.copyFile(host, path.join(hostDir, "runner-host.mjs"));
		const map: RunnerMap = { board: `${WORKSPACE}/board`, platform: `${WORKSPACE}/platform`, components: [], settings: {}, options: {} };
		await fs.writeFile(path.join(hostDir, "runner.map.json"), JSON.stringify(map, null, 2));

		const args = action === "build"
			? ["build", "--map", `${HOST_DIR}/runner.map.json`, WORKSPACE]
			: ["flash", "--map", `${HOST_DIR}/runner.map.json`, "--port", options.port!, "--baudrate", options.baudrate,
				...(options.firmware ? ["--firmware", `${platform.build.output}/${options.firmware}`] : []), WORKSPACE];

		const docker = spawn("docker", [
			"run", "--rm",
			"--volume", `${boardDir}:${WORKSPACE}/board:ro`,
			"--volume", `${platform.path}:${WORKSPACE}/platform:ro`,
			"--volume", `${hostDir}:${HOST_DIR}:ro`,
			"--volume", `${path.resolve(process.cwd(), options.output)}:${platform.build.output}`,
			"--volume", `${CACHE_VOLUME}:/root/.cache/hio`,
			"--workdir", WORKSPACE,
			board.firmware.image,
			"node", `${HOST_DIR}/runner-host.mjs`, ...args,
		], { stdio: "inherit" });

		docker.on("error", (err) => {
			console.error(`[-] Couldn't run docker: ${err.message}`);
			exit(1);
		});
		docker.on("close", async (code) => {
			await fs.rm(hostDir, { recursive: true, force: true }).catch(() => {});
			exit(code ?? 1);
		});

	});
};
