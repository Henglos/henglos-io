import * as path from "path";
import * as fs from "fs/promises";
import { pathToFileURL } from "url";
import { PackageService, type ComponentPackage } from "@henglosio/shared";
import { resolveBoardOptions } from "@henglosio/workflow";
import { resolvePlatform } from "./platform.js";
import type { ResolvedPackages } from "./runner.js";

// Container mode (runner.map.json) lives in runner.js — what the injected runner
// host is built from. Re-exported: the commands find everything here.
export { createSend, loadBoardFirmware, loadRunner, resolveFromMap, type ResolvedPackages, type RunnerMap } from "./runner.js";

const packages = new PackageService();

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
	return { board, platform, components, settings: {}, options: resolveBoardOptions(board.options ?? [], {}) };

}

