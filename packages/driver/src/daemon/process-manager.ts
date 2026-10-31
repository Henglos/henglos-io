import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { daemonizeProcess } from "daemonize-process";

const STATE_DIR = path.join(os.homedir(), ".henglos", "io", "driver");
const PID_FILE = path.join(STATE_DIR, "daemon.pid.json");
const LOG_FILE = path.join(STATE_DIR, "daemon.log");

type PidFile = {
	pid: number;
	startedAt: string;
};

const ensureStateDir = async (): Promise<void> => {
	await fs.mkdir(STATE_DIR, { recursive: true });
};

const readPidFile = async (): Promise<PidFile | null> => {
	try {
		const raw = await fs.readFile(PID_FILE, "utf-8");
		return JSON.parse(raw) as PidFile;
	} catch {
		return null;
	}
};

const writePidFile = async (pid: number): Promise<void> => {
	const data: PidFile = { pid, startedAt: new Date().toISOString() };
	await fs.writeFile(PID_FILE, JSON.stringify(data, null, 2), "utf-8");
};

const removePidFile = async (): Promise<void> => {
	await fs.rm(PID_FILE, { force: true });
};

// Running as the daemon (startDaemon) — not in the foreground ("run" mode).
let daemonized = false;

// Set on the driver a restart starts: the pid it waits to be gone before it runs.
const RESTART_AFTER_ENV = "HIO_DRIVER_RESTART_AFTER";

const isAlive = (pid: number): boolean => {
	try {
		// Signal 0 doesn't kill the process — it only tests that it exists and that we may signal it.
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

/**
 * Runs the driver in the background (`hio driver start`). Called at the very
 * start of the process: on the first pass, `daemonizeProcess` spawns a
 * detached child and ends the parent right here; on the second (already in
 * the child) it just returns, and execution goes on below — with a pidfile
 * and its output in daemon.log. Does nothing if the driver already runs.
 */
export const startDaemon = async (run: () => Promise<void>): Promise<void> => {
	await ensureStateDir();

	const existing = await readPidFile();
	if (existing && isAlive(existing.pid)) {
		console.log(`Running in pid ${existing.pid}`);
		return;
	}
	if (existing) {
		// A stale pidfile, from an earlier run that died without cleaning up.
		await removePidFile();
	}

	const logFd = fsSync.openSync(LOG_FILE, "a");

	daemonizeProcess({
		stdio: ["ignore", logFd, logFd],
	});

	// From here on, only the daemonized process (the child) keeps running.
	fsSync.closeSync(logFd);

	await writePidFile(process.pid);
	daemonized = true;

	const cleanup = async () => {
		await removePidFile();
		process.exit(0);
	};
	process.on("SIGTERM", cleanup);
	process.on("SIGINT", cleanup);

	console.log(`Running in pid ${process.pid}`);
	console.log(`Logs in ${LOG_FILE}`);

	await run();
};

/**
 * A driver started by restartDriver: waits for the one it replaces to be
 * gone — its pidfile, its serial ports — before it goes on. Returns at once
 * otherwise (at most 15 s: a process that won't exit doesn't hold it forever).
 */
export const waitForReplacedDriver = async (): Promise<void> => {
	const pid = Number(process.env[RESTART_AFTER_ENV]);
	if (!pid || pid === process.pid) return;
	const deadline = Date.now() + 15_000;
	while (isAlive(pid) && Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 100));
	}
};

/**
 * Restarts this driver: starts it again the way it was started (same
 * command, same mode — in the background with its log, or in this terminal)
 * and exits. The new one waits for this one to be gone (waitForReplacedDriver).
 */
export const restartDriver = async (): Promise<never> => {
	const logFd = daemonized ? fsSync.openSync(LOG_FILE, "a") : undefined;
	const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
		detached: daemonized,
		stdio: logFd !== undefined ? ["ignore", logFd, logFd] : "inherit",
		env: { ...process.env, [RESTART_AFTER_ENV]: String(process.pid) },
		windowsHide: true,
	});
	child.unref();
	if (logFd !== undefined) fsSync.closeSync(logFd);

	console.log(`Restarting the driver with new pid ${child.pid}`);
	if (daemonized) await removePidFile();
	process.exit(0);
};

/** Stops the driver running in the background (SIGTERM to the pid in its pidfile). */
export const stopDaemon = async (): Promise<void> => {
	const existing = await readPidFile();

	if (!existing || !isAlive(existing.pid)) {
		console.log("Driver not running.");
		if (existing) await removePidFile();
		return;
	}

	process.kill(existing.pid, "SIGTERM");
	console.log(`Stopping driver in pid ${existing.pid}`);
};

/** Prints whether the driver is running in the background, and its pid. */
export const daemonStatus = async (): Promise<void> => {
	const existing = await readPidFile();

	if (!existing || !isAlive(existing.pid)) {
		console.log("status: stopped");
		if (existing) await removePidFile();
		return;
	}

	const uptimeMs = Date.now() - new Date(existing.startedAt).getTime();
	const uptimeMin = Math.floor(uptimeMs / 60000);

	console.log("status: running");
	console.log(`pid: ${existing.pid}`);
	console.log(`from: ${existing.startedAt} (${uptimeMin} min ago)`);
	console.log(`logs: ${LOG_FILE}`);
};
