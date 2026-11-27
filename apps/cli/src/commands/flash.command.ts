import * as path from "path";
import { exit } from "process";
import type { Command } from "commander";
import { connectDriver } from "@henglosio/runner";
import { flashFirmware } from "../core/firmware.js";
import { loadBoardFirmware, resolveFromMap, resolveFromWorkspace } from "../core/packages.js";

/**
 * Registers `hio flash <workspace>`.
 *
 * Has the board's firmware script write its MicroPython firmware to the board
 * on `--port` — erasing it first unless HIO_FLASH_ERASE=0.
 *
 * Options:
 * - `--port` (required) — the serial port of the board. Inside a container
 *   it's the driver's RFC 2217 tunnel to the board's USB port.
 * - `--firmware` — a local firmware image. Without it, the board's script
 *   writes its stock one.
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
	flashCommand.description("write the board's MicroPython firmware, with the board's script");
	flashCommand.option("--map <path>", "path to runner.map.json");
	flashCommand.option("--port <port>", "serial port to flash to");
	flashCommand.option("--firmware <path>", "local firmware image (default: the board's stock firmware)");
	flashCommand.option("--baudrate <rate>", "baud rate for flashing", "460800");
	flashCommand.option("--method <method>", "how to write it: serial, or uf2 (only when the driver runs it)", "serial");
	flashCommand.action(async (workspace: string, options: { map?: string; port?: string; firmware?: string; baudrate: string; method: string }) => {

		workspace = path.resolve(process.cwd(), workspace);
		const driver = connectDriver();
		const send = driver.send;

		if (!options.port) {
			console.error("[-] --port is required.");
			exit(1);
		}
		if (options.method !== "serial" && options.method !== "uf2") {
			console.error(`[-] Unknown --method ${options.method} — use serial or uf2.`);
			exit(1);
		}

		try {

			// Flashing writes the firmware only: the components aren't needed.
			const { board, options: boardOptions } = options.map
				? await resolveFromMap(path.resolve(process.cwd(), options.map))
				: await resolveFromWorkspace(workspace);

			const baudrate = Number(options.baudrate);
			await flashFirmware({
				board,
				boardFirmware: await loadBoardFirmware(board),
				options: boardOptions,
				method: options.method,
				baudrate,
				// The driver's broker when it started this (HIO_BROKER_URL), the port alone otherwise.
				broker: driver.broker(options.port, baudrate),
				erase: process.env.HIO_FLASH_ERASE !== "0",
				...(options.firmware ? { firmware: path.resolve(process.cwd(), options.firmware) } : {}),
				log: (data) => send({ type: "data", data }),
				phase: (phase) => send({ type: "phase", phase }),
			});

		} catch (err) {
			await send({ type: "error", id: "flash_failed", data: err instanceof Error ? err.message : String(err) });
			exit(1);
		}

	});
};
