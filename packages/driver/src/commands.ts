import type { Command } from "commander";

// The driver's commands, as `hio driver …` of the Henglos IO CLI
// (apps/cli). Only their definitions live here: each loads the driver
// (runtime.ts) when it runs, so `hio build` / `hio flash` — run inside build
// containers — never load it.

const runtime = () => import("./runtime.js");

/**
 * Registers `hio driver` and its subcommands — configure, login, start, stop, status —
 * on the CLI's program. Each loads the driver (runtime.ts) only when it runs.
 *
 * @param cli The `hio` program.
 * @returns The `driver` command.
 */
export const registerDriverCommands = (cli: Command): Command => {

	const driver = cli
		.command("driver")
		.description("run this machine as a Henglos IO driver — the link between your boards and the server");

	driver
		.command("configure")
		.description("point the driver at a Henglos IO server")
		.argument("<server>", "URL of the Henglos IO server (ex: https://hio.localhost)")
		.action(async (server: string) => {
			await (await runtime()).configure(server);
		});

	driver
		.command("login")
		.description("pair the driver with your account")
		.argument("<pairToken>", "pair token created in the studio (Drivers)")
		.argument("<name>", "the name this driver shows up as")
		.action(async (pairToken: string, name: string) => {
			await (await runtime()).login(pairToken, name);
		});

	driver
		.command("start")
		.description("start the driver")
		.option("-m, --mode <mode>", "'daemon' (in the background) or 'run' (in the foreground, logs in the terminal)", "daemon")
		.action(async (options: { mode: string }) => {
			await (await runtime()).start(options.mode);
		});

	driver
		.command("stop")
		.description("stop the running driver")
		.action(async () => {
			await (await runtime()).stop();
		});

	driver
		.command("status")
		.description("show whether the driver is running")
		.action(async () => {
			await (await runtime()).status();
		});

	return driver;

};
