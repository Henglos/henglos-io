import type { Command } from "commander";

// The driver's commands, as `hio driver …` of the Henglos IO CLI
// (apps/cli). Only their definitions live here: each loads the driver
// (runtime.ts) when it runs, so `hio build` / `hio flash` — run inside build
// containers — never load it.

const runtime = () => import("./runtime.js");

/**
 * Runs a command, reporting a failure as one log line — its message, under the
 * scope it names ("[auth] …" -> [auth]) — instead of a stack trace. The trace is
 * there with HIO_LOG_LEVEL=debug.
 */
const run = <A extends unknown[]>(action: (...args: A) => Promise<void>) => async (...args: A): Promise<void> => {
	try {
		await action(...args);
	} catch (err) {
		const { logger } = await import("./daemon/infrastructure/logger/Logger.js");
		const message = err instanceof Error ? err.message : String(err);
		const scoped = /^\[([\w:-]+)\] ([\s\S]*)$/.exec(message);
		const log = logger.withTag(scoped?.[1] ?? "driver");
		log.error(scoped?.[2] ?? message);
		if (err instanceof Error && err.stack) log.debug(err.stack);
		process.exitCode = 1;
	}
};

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
		.action(run(async (server: string) => {
			await (await runtime()).configure(server);
		}));

	driver
		.command("login")
		.description("pair the driver with your account")
		.argument("<pairToken>", "pair token created in the studio (Drivers)")
		.argument("<name>", "the name this driver shows up as")
		.action(run(async (pairToken: string, name: string) => {
			await (await runtime()).login(pairToken, name);
		}));

	driver
		.command("start")
		.description("start the driver")
		.option("-m, --mode <mode>", "'daemon' (in the background) or 'run' (in the foreground, logs in the terminal)", "daemon")
		.action(run(async (options: { mode: string }) => {
			await (await runtime()).start(options.mode);
		}));

	driver
		.command("stop")
		.description("stop the running driver")
		.action(run(async () => {
			await (await runtime()).stop();
		}));

	driver
		.command("status")
		.description("show whether the driver is running")
		.action(run(async () => {
			await (await runtime()).status();
		}));

	return driver;

};
