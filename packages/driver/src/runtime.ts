// First: tsyringe's decorators read the metadata it adds, as the modules below load.
import "reflect-metadata";
import { container } from "tsyringe";
import { runDaemon } from "./daemon/run.js";
import { LoginDriverUseCase } from "./daemon/application/use-cases/auth/LoginDriver.use-case.js";
import { ConfigureDriverUseCase } from "./daemon/application/use-cases/auth/ConfigureDriver.use-case.js";
import { startDaemon, stopDaemon, daemonStatus, waitForReplacedDriver } from "./daemon/process-manager.js";

// What the driver commands (commands.ts) run — loaded only when one runs, so
// the CLI's other commands never pull in serial, docker or socket.io.

export const configure = (server: string) => container.resolve(ConfigureDriverUseCase).execute(server);

/** `hio driver login`: pairs this machine with an account, with a pair token from the studio. */
export const login = (pairToken: string, name: string) => container.resolve(LoginDriverUseCase).execute(pairToken, name);

/** "daemon": in the background. "run": in the foreground, logs in the terminal. */
export const start = async (mode: string) => {
	// Started by a restart: the driver it replaces goes first.
	await waitForReplacedDriver();
	return mode === "run" ? runDaemon() : startDaemon(runDaemon);
};

/** `hio driver stop`: stops the driver running in the background. */
export const stop = () => stopDaemon();

/** `hio driver status`: whether the driver is running in the background. */
export const status = () => daemonStatus();
