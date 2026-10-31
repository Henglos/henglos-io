import * as path from "path";
import { exit } from "process";
import type { Command } from "commander";
import type { BuildContext } from "@henglosio/runner";
import { createSend, loadRunner, resolveFromMap, resolveFromWorkspace } from "../core/packages.js";

/**
 * Registers `hio build <workspace>`.
 *
 * Resolves the board, the platform and the components, then hands them to the
 * platform's Runner, which compiles the runtime and the components for the
 * board's firmware.
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
	buildCommand.description("run the platform's build: compile the runtime and components for the board's firmware");
	buildCommand.option("--map <path>", "path to runner.map.json");
	buildCommand.action(async (workspace: string, options: { map?: string }) => {

		workspace = path.resolve(process.cwd(), workspace);
		const send = createSend(process.env.HIO_CALLBACK_URL);

		try {

			const { board, platform, components, settings } = options.map
				? await resolveFromMap(path.resolve(process.cwd(), options.map))
				: await resolveFromWorkspace(workspace);

			const context: BuildContext = {
				workspace,
				board,
				platform,
				components,
				settings,
				log: (data) => send({ type: "data", data }),
			};

			await (await loadRunner(platform)).build(context);

		} catch (err) {
			await send({ type: "error", id: "build_failed", data: err instanceof Error ? err.message : String(err) });
			exit(1);
		}

	});
};
