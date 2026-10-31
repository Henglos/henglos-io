import * as path from "path";
import { exit } from "process";
import type { Command } from "commander";
import type { FlashContext } from "@henglosio/runner";
import { createSend, loadRunner, resolveFromMap, resolveFromWorkspace } from "../core/packages.js";

/**
 * Registers `hio flash <workspace>`.
 *
 * Writes the board's MicroPython firmware to the board on `--port`, through
 * the platform's Runner.
 *
 * Options:
 * - `--port` (required) — the serial port of the board. Inside a container
 *   it's the driver's RFC 2217 tunnel to the board's USB port.
 * - `--firmware` — a local firmware image. Without it, the Runner uses the
 *   board manifest's `firmware.image`.
 * - `--baudrate` — how fast to write (default 460800).
 * - `--map` — container mode, as in `hio build`.
 *
 * Progress goes to `HIO_CALLBACK_URL` when it's set (the driver), to the
 * terminal otherwise. On failure it reports a `flash_failed` error and exits
 * with code 1.
 *
 * @param cli The `hio` program to add the command to.
 */
export const registerFlashCommand = (cli: Command) => {
	const flashCommand = cli.command("flash <workspace>");
	flashCommand.description("run the platform's flash: write the board's MicroPython firmware");
	flashCommand.option("--map <path>", "path to runner.map.json");
	flashCommand.option("--port <port>", "serial port to flash to");
	flashCommand.option("--firmware <path>", "local firmware image (default: the board manifest's firmware.image)");
	flashCommand.option("--baudrate <rate>", "baud rate for flashing", "460800");
	flashCommand.action(async (workspace: string, options: { map?: string; port?: string; firmware?: string; baudrate: string }) => {

		workspace = path.resolve(process.cwd(), workspace);
		const send = createSend(process.env.HIO_CALLBACK_URL);

		if (!options.port) {
			console.error("[-] --port is required.");
			exit(1);
		}

		try {

			// Flashing writes the firmware only: the components aren't needed.
			const { board, platform } = options.map
				? await resolveFromMap(path.resolve(process.cwd(), options.map))
				: await resolveFromWorkspace(workspace);

			const context: FlashContext = {
				workspace,
				board,
				port: options.port,
				baudrate: Number(options.baudrate),
				...(options.firmware ? { firmware: path.resolve(process.cwd(), options.firmware) } : {}),
				advanced: {},
				log: (data) => send({ type: "data", data }),
			};

			await (await loadRunner(platform)).flash(context);

		} catch (err) {
			await send({ type: "error", id: "flash_failed", data: err instanceof Error ? err.message : String(err) });
			exit(1);
		}

	});
};
