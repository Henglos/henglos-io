// What runs inside the build container — reading runner.map.json and loading
// the board's firmware script. Kept apart from the registry (pacote) and the
// driver: it's what dist/runner-host.mjs, the self-contained runner the driver
// injects into the container, is built from.

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
import type { BoardFirmware } from "@henglosio/runner";

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
	/** The value of each of the board's options: the workflow's, or the default. */
	options: Record<string, string>;
};

/**
 * runner.map.json, written by the driver into the container: absolute paths
 * of the mounted packages, and the workflow's values of the board's options.
 */
export type RunnerMap = {
	board: string;
	platform: string;
	components: string[];
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

	return { board, platform, components, options: resolveBoardOptions(board.options ?? [], map.options ?? {}) };

}

/**
 * Loads a board's firmware script — the file its manifest names in
 * `firmware.script`. Node runs it as TypeScript, as long as it isn't under a
 * node_modules folder.
 *
 * @param board The resolved board package.
 * @returns The script's default export.
 * @throws When it can't be loaded, or doesn't export `prepare` and `flash`
 *   (and `build`, when it has one, as a function).
 */
export async function loadBoardFirmware(board: BoardPackage): Promise<BoardFirmware> {
	const script = path.resolve(board.path, board.firmware.script);
	const mod = await import(pathToFileURL(script).href) as { default?: Partial<BoardFirmware> };
	const firmware = mod.default;
	if (typeof firmware?.prepare !== "function" || typeof firmware.flash !== "function"
		|| (firmware.build !== undefined && typeof firmware.build !== "function")) {
		throw new Error(`${board.firmware.script} must export default { prepare, build?, flash }.`);
	}
	return mod.default as BoardFirmware;
}
