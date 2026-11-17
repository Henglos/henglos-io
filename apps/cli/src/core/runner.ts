// What runs inside the build container — reading runner.map.json, loading the
// platform's Runner and the board's firmware script, reporting back. Kept apart
// from the registry (pacote) and the driver: it's what dist/runner-host.mjs,
// the self-contained runner the driver injects into the container, is built from.

import * as path from "path";
import * as fs from "fs/promises";
import { pathToFileURL } from "url";
import {
	PackageService,
	type BoardPackage,
	type ComponentPackage,
	type PlatformPackage,
} from "@henglosio/shared";
import { resolveBoardOptions, type BoardOptionValue } from "@henglosio/workflow";
import type { BoardFirmware, Runner, RunnerProtocol } from "@henglosio/runner";

const packages = new PackageService();

/**
 * What `hio build` / `hio flash` work on: the board, the runtime and the
 * workflow's components, each resolved to the folder its manifest.yaml is in
 * and validated.
 */
export type ResolvedPackages = {
	board: BoardPackage;
	platform: PlatformPackage;
	components: ComponentPackage[];
	/** The workflow's platform setting overrides, by name. Empty: the platform's defaults. */
	settings: Record<string, number>;
	/** The value of each of the board's options: the workflow's, or the default. */
	options: Record<string, string>;
};

/**
 * runner.map.json, written by the driver into the container: absolute paths
 * of the mounted packages, and the workflow's platform setting overrides.
 */
export type RunnerMap = {
	board: string;
	platform: string;
	components: string[];
	settings?: Record<string, number>;
	options?: Record<string, BoardOptionValue>;
};

/**
 * Container mode: everything comes from runner.map.json.
 *
 * @param mapPath Absolute path to runner.map.json.
 * @returns The packages the map points to, validated.
 * @throws When one of them isn't a valid package of its kind.
 */
export async function resolveFromMap(mapPath: string): Promise<ResolvedPackages> {

	const map = JSON.parse(await fs.readFile(mapPath, "utf-8")) as RunnerMap;

	const board = await packages.validateBoard(map.board);
	if (!board) throw new Error(`Invalid board package at ${map.board}`);

	const platform = await packages.validatePlatform(map.platform);
	if (!platform) throw new Error(`Invalid platform package at ${map.platform}`);

	const components: ComponentPackage[] = [];
	for (const componentPath of map.components) {
		const component = await packages.validateComponent(componentPath);
		if (!component) throw new Error(`Invalid component package at ${componentPath}`);
		components.push(component);
	}

	return { board, platform, components, settings: map.settings ?? {}, options: resolveBoardOptions(board.options ?? [], map.options ?? {}) };

}

/**
 * Loads the platform's Runner — the object that builds the platform and
 * flashes the board's firmware. It's the script the platform's manifest names
 * in `build.script`, so each platform version brings its own.
 *
 * @param platform The resolved platform package.
 * @returns The script's default export (or the module itself, for CommonJS).
 */
export async function loadRunner(platform: PlatformPackage): Promise<Runner> {
	const mod = await import(pathToFileURL(path.resolve(platform.path, platform.build.script)).href);
	return (mod.default ?? mod) as Runner;
}

/**
 * Loads a board's firmware script — the file its manifest names in
 * `firmware.script`. Node runs it as TypeScript, as long as it isn't under a
 * node_modules folder.
 *
 * @param board The resolved board package.
 * @returns The script's default export.
 * @throws When it can't be loaded, or doesn't export `build` and `flash`.
 */
export async function loadBoardFirmware(board: BoardPackage): Promise<BoardFirmware> {
	const script = path.resolve(board.path, board.firmware.script);
	const mod = await import(pathToFileURL(script).href) as { default?: Partial<BoardFirmware> };
	if (typeof mod.default?.build !== "function" || typeof mod.default.flash !== "function") {
		throw new Error(`${board.firmware.script} must export default { build, flash }.`);
	}
	return mod.default as BoardFirmware;
}

/**
 * Where the Runner's logs, phases and errors go.
 *
 * - With a callback URL (container mode): each message is POSTed, as JSON, to
 *   the driver — which passes it on to the studio. A phase goes as one only to a
 *   driver that says it reads them (`HIO_RUNNER_PHASES=1`); to an older one, as
 *   a log line.
 * - Without one (local mode): logs and phases go to stdout, errors to stderr.
 *
 * @param callbackUrl The driver's `HIO_CALLBACK_URL`, if any.
 * @returns A function that sends one message.
 */
export function createSend(callbackUrl: string | undefined): (payload: RunnerProtocol) => Promise<void> {
	const phaseLine = (phase: string) => `── ${phase} ──\n`;
	if (!callbackUrl) {
		return async (payload) => {
			if (payload.type === "data") process.stdout.write(payload.data);
			else if (payload.type === "phase") process.stdout.write(phaseLine(payload.phase));
			else process.stderr.write(`[error:${payload.id}] ${payload.data}\n`);
		};
	}
	const phases = process.env["HIO_RUNNER_PHASES"] === "1";
	return async (payload) => {
		if (payload.type === "phase" && !phases) payload = { type: "data", data: phaseLine(payload.phase) };
		await fetch(callbackUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
	};
}
