import { spawn } from "child_process";
import * as path from "path";
import { exit } from "process";
import type { Command } from "commander";
import { PackageService } from "@henglosio/shared";

const WORKSPACE = "/workspace";
const CACHE_VOLUME = "henglosio-firmware-cache";

/**
 * Registers `hio firmware build|flash [board]`: runs a board's firmware script in
 * its image, the way the driver does, to try it without the studio.
 *
 * The board is mounted in the container, where `hio build` / `hio flash` run in
 * local mode: the platform comes from the registry (HENGLOS_REGISTRY).
 *
 * @param cli The `hio` program to add the command to.
 */
export const registerFirmwareCommand = (cli: Command) => {
	const firmwareCommand = cli.command("firmware <action> [board]");
	firmwareCommand.description("try a board's firmware script in its image — action: build or flash");
	firmwareCommand.option("--output <path>", "where the build goes", "hio-build");
	firmwareCommand.option("--port <url>", "flash: serial port the container can reach (rfc2217://…)");
	firmwareCommand.option("--firmware <path>", "flash: firmware image, in the output folder (default: the board's stock firmware)");
	firmwareCommand.action(async (action: string, boardArg: string | undefined, options: { output: string; port?: string; firmware?: string }) => {

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

		const hio = action === "build"
			? ["build", WORKSPACE]
			: ["flash", WORKSPACE, "--port", options.port!, ...(options.firmware ? ["--firmware", `${WORKSPACE}/build/${options.firmware}`] : [])];

		const docker = spawn("docker", [
			"run", "--rm",
			"--volume", `${boardDir}:${WORKSPACE}/board:ro`,
			"--volume", `${path.resolve(process.cwd(), options.output)}:${WORKSPACE}/build`,
			"--volume", `${CACHE_VOLUME}:/root/.cache/hio`,
			...(process.env.HENGLOS_REGISTRY ? ["--env", `HENGLOS_REGISTRY=${process.env.HENGLOS_REGISTRY}`] : []),
			"--workdir", WORKSPACE,
			board.firmware.image,
			"npx", "hio", ...hio,
		], { stdio: "inherit" });

		docker.on("error", (err) => {
			console.error(`[-] Couldn't run docker: ${err.message}`);
			exit(1);
		});
		docker.on("close", (code) => exit(code ?? 1));

	});
};
