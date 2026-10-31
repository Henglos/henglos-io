import * as path from "path";
import * as fs from "fs/promises";
import {
	PackageService,
	type BoardPackage,
	type ComponentPackage,
	type PlatformPackage,
} from "@henglosio/shared";
import type { Runner, RunnerProtocol } from "@henglosio/runner";
import { resolvePlatform } from "./platform.js";

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
};

/**
 * runner.map.json, written by the driver into the container: absolute paths
 * of the mounted packages, and the workflow's platform setting overrides.
 */
type RunnerMap = {
	board: string;
	platform: string;
	components: string[];
	settings?: Record<string, number>;
};

const packages = new PackageService();

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

	return { board, platform, components, settings: map.settings ?? {} };

}

/**
 * Local mode: reads the packages from a workspace folder laid out as
 *
 * ```txt
 * <workspace>/
 *   board/            the board package
 *   components/*      one folder per component (optional)
 * ```
 *
 * The platform isn't in the workspace: it's the one the board depends on,
 * fetched from the registry (see {@link resolvePlatform}).
 *
 * @param workspace Absolute path to the workspace folder.
 * @returns The packages, validated, with no setting overrides.
 * @throws When the board or a component isn't a valid package.
 */
export async function resolveFromWorkspace(workspace: string): Promise<ResolvedPackages> {

	const boardPath = path.join(workspace, "board");
	const board = await packages.validateBoard(boardPath);
	if (!board) throw new Error(`Invalid board package at ${boardPath}`);

	const platform = await resolvePlatform(board.dependences.platform);

	const components: ComponentPackage[] = [];
	const componentsDir = path.join(workspace, "components");
	// No components/ folder: a workspace with only a board.
	const entries = await fs.readdir(componentsDir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const component = await packages.validateComponent(path.join(componentsDir, entry.name));
		if (!component) throw new Error(`Invalid component package: ${entry.name}`);
		components.push(component);
	}

	// Local builds run with the platform's defaults.
	return { board, platform, components, settings: {} };

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
	const mod = await import(path.resolve(platform.path, platform.build.script));
	return (mod.default ?? mod) as Runner;
}

/**
 * Where the Runner's logs and errors go.
 *
 * - With a callback URL (container mode): each message is POSTed, as JSON, to
 *   the driver — which passes it on to the studio.
 * - Without one (local mode): logs go to stdout, errors to stderr.
 *
 * @param callbackUrl The driver's `HIO_CALLBACK_URL`, if any.
 * @returns A function that sends one message.
 */
export function createSend(callbackUrl: string | undefined): (payload: RunnerProtocol) => Promise<void> {
	if (!callbackUrl) {
		return async (payload) => {
			if (payload.type === "data") process.stdout.write(payload.data);
			else process.stderr.write(`[error:${payload.id}] ${payload.data}\n`);
		};
	}
	return async (payload) => {
		await fetch(callbackUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
	};
}
