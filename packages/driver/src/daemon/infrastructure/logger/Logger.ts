import { createConsola, type ConsolaInstance, type ConsolaReporter } from "consola";
import { formatWithOptions } from "node:util";

// How much the driver says: HIO_LOG_LEVEL=silent | error | warn | info | debug | trace.
// info by default; debug adds each reply to the hosting and the USB tunnel's
// settings, trace every byte it carries.
const LEVELS: Record<string, number> = { silent: -999, error: 0, warn: 1, info: 3, debug: 4, trace: 5 };

const level = LEVELS[(process.env["HIO_LOG_LEVEL"] ?? "info").toLowerCase()] ?? LEVELS["info"]!;

// What a line's level is called: consola's types, as the usual five levels.
const LABEL: Record<string, string> = {
	fatal: "ERROR", error: "ERROR", warn: "WARN", log: "INFO", info: "INFO", success: "INFO",
	start: "INFO", ready: "INFO", box: "INFO", debug: "DEBUG", trace: "TRACE", verbose: "TRACE",
};

/**
 * One line per entry, for a file (the daemon's log): when, how serious, where
 * from, what — `2026-11-06 10:00:01.123 INFO  [task] compile 1a2b3c4d started`.
 */
const plain: ConsolaReporter = {
	log(entry) {
		const time = entry.date.toISOString().replace("T", " ").replace("Z", "");
		const label = (LABEL[entry.type] ?? entry.type.toUpperCase()).padEnd(5);
		const scope = entry.tag ? `[${entry.tag}] ` : "";
		const text = formatWithOptions({ colors: false, breakLength: Infinity }, ...entry.args);
		const stream = entry.level <= 1 ? process.stderr : process.stdout;
		stream.write(`${time} ${label} ${scope}${text}\n`);
	},
};

/**
 * The driver's logger: a level, the time and a scope on every line — colored in a
 * terminal (`hio driver start --mode run`), plain text in the daemon's log file.
 */
export const logger: ConsolaInstance = createConsola({
	level,
	fancy: process.stdout.isTTY,
	formatOptions: { date: true, colors: process.stdout.isTTY },
	...(process.stdout.isTTY ? {} : { reporters: [plain] }),
});

/** A logger for one part of the driver — its lines carry `[scope]`. */
export const createLogger = (scope: string): ConsolaInstance => logger.withTag(scope);

/** A task id as the logs show it: its first 8 characters are enough to tell tasks apart. */
export const shortId = (id: string) => id.slice(0, 8);
