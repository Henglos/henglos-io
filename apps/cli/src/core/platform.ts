import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import pacote from "pacote";
import { PackageService } from "@henglosio/shared";
import type { PlatformPackage } from "@henglosio/shared";

const PACKAGE_NAME = "@henglosio/platform";
/** Where downloaded platforms are kept: one folder per requested version. */
const CACHE_DIR = path.join(os.homedir(), ".henglos", "io", "platforms");
/** The public npm registry. In development, HENGLOS_REGISTRY points at the local Verdaccio (http://localhost:4873). */
const DEFAULT_REGISTRY = "https://registry.npmjs.org/";

/** The npm registry to fetch the platform from: `HENGLOS_REGISTRY`, else the public one. */
function registryUrl() {
	return process.env["HENGLOS_REGISTRY"] ?? DEFAULT_REGISTRY;
}

/** Whether a platform was already extracted into `versionDir`. */
async function isCached(versionDir: string): Promise<boolean> {
	return fs.access(path.join(versionDir, "manifest.yaml")).then(() => true).catch(() => false);
}

/**
 * Gets the platform for a local build: downloads `@henglosio/platform` from
 * the registry the first time, then reuses the copy in
 * `~/.henglos/io/platforms/<version>`.
 *
 * @param version A version or a semver range — what the board's
 *   `dependences.platform` says (e.g. `^1.0.0`).
 * @returns The platform package, validated.
 * @throws When the download fails, or what was downloaded isn't a valid platform.
 */
export async function resolvePlatform(version: string): Promise<PlatformPackage> {
	// Cached by what was asked for, not by the version it resolved to: a range
	// keeps the version it first resolved to until the folder is removed.
	const versionDir = path.join(CACHE_DIR, version);

	if (!(await isCached(versionDir))) {
		console.log(`[platform] Installing ${PACKAGE_NAME}@${version} from ${registryUrl()}...`);
		await fs.mkdir(versionDir, { recursive: true });
		await pacote.extract(`${PACKAGE_NAME}@${version}`, versionDir, {
			registry: registryUrl(),
		});
		console.log(`[platform] Cached at ${versionDir}`);
	}

	const platform = await new PackageService().validatePlatform(versionDir);
	if (!platform) throw new Error(`Invalid platform package at ${versionDir}`);
	return platform;
}
