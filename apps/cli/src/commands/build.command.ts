import * as path from "path";
import { exit } from "process";
import type { Command } from "commander";
import { BUILD_OUTPUT, connectDriver } from "@henglosio/runner";
import { buildFirmware } from "../core/firmware.js";
import { loadBoardFirmware, resolveFromMap, resolveFromWorkspace } from "../core/packages.js";

/**
 * Registers `hio build <workspace>`.
 *
 * Resolves the board, the platform and the components, then builds the runtime
 * and the components with the mpy-cross the board's `prepare` returns — the
 * runtime frozen into a firmware when the board's script has a `build`.
 *
 * Two ways to run it:
 * - **Container mode** (`--map runner.map.json`) — how the driver runs it: the
 *   packages are already mounted, and the map says where.
 * - **Local mode** (no `--map`) — the packages are read from the workspace
 *   folder, and the platform is fetched from the registry.
 *
 * Progress goes to `HIO_CALLBACK_URL` when it's set (the driver), to the
 * terminal otherwise. On failure it reports a `build_failed` error and exits
 * with code 1.
 *
 * @param cli The `hio` program to add the command to.
 */
export const registerBuildCommand = (cli: Command) => {
	const buildCommand = cli.command("build <workspace>");
	buildCommand.description("build the runtime and components for the board's firmware, with the board's mpy-cross");
	buildCommand.option("--map <path>", "path to runner.map.json");
	buildCommand.option("--output <path>", "where the build goes", BUILD_OUTPUT);
	buildCommand.action(async (workspace: string, options: { map?: string; output: string }) => {

		workspace = path.resolve(process.cwd(), workspace);
		const send = connectDriver().send;

		try {

			const { board, platform, components, options: boardOptions } = options.map
				? await resolveFromMap(path.resolve(process.cwd(), options.map))
				: await resolveFromWorkspace(workspace);

			await buildFirmware({
				board,
				platform,
				components,
				boardFirmware: await loadBoardFirmware(board),
				options: boardOptions,
				output: path.resolve(process.cwd(), options.output),
				log: (data) => send({ type: "data", data }),
				phase: (phase) => send({ type: "phase", phase }),
			});

		} catch (err) {
			await send({ type: "error", id: "build_failed", data: err instanceof Error ? err.message : String(err) });
			exit(1);
		}

	});
};
