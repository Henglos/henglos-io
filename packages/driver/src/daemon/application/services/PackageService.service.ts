import path from "node:path";
import pacote from "pacote";
import fs from "fs/promises";
import os from "os";
import { ManifestService } from "@henglosio/shared";
import { injectable } from "tsyringe";

// The npm registry packages come from: HIO_REGISTRY_URL — the hosting's own
// setting, so one name points both at the same registry (the dev Gitea:
// http://localhost:3000/api/packages/henglosio/npm/). HENGLOS_REGISTRY, its
// earlier name, still works. The public npm registry otherwise.
const DEFAULT_REGISTRY = "https://registry.npmjs.org/";

function registryUrl(): string {
	return process.env["HIO_REGISTRY_URL"] || process.env["HENGLOS_REGISTRY"] || DEFAULT_REGISTRY;
}

/** A package installed in the driver's cache, and where. */
export type CachedPackage = {

	type: "component" | "board" | "platform";
	name: string;
	version: string;
	path: string;

}

/**
 * The driver's package cache (~/.henglos/io/driver/packages): boards, components and the
 * platform, installed from the registry (HIO_REGISTRY_URL) once per version.
 */
@injectable()
export class PackageService {

	private GLOBAL_PACKAGES_PATH = path.join(os.homedir(), ".henglos", "io", "driver", "packages");

	private readonly manifestService: ManifestService = new ManifestService();

	constructor() {}

	private safeName(name: string): string {
		return name.replaceAll("/", "__");
	}

	async initialize() {

		await fs.mkdir(this.GLOBAL_PACKAGES_PATH, { recursive: true });

	}

	async install(name: string, version: string): Promise<CachedPackage | null> {
		const finalDir = path.join(this.GLOBAL_PACKAGES_PATH, this.safeName(name), version);

		// Straight into its folder, never extracted elsewhere and renamed: on
		// Windows a rename fails (EPERM) while an antivirus still holds the fresh
		// files, or when the folder is already there. What's there now — a stale
		// copy the cache can't use — goes first, so no old file outlives it.
		await fs.rm(finalDir, { recursive: true, force: true });

		try {
			await pacote.extract(`${name}@${version}`, finalDir, { registry: registryUrl() });
		} catch (e) {
			await fs.rm(finalDir, { recursive: true, force: true });
			throw e;
		}

		return this.getPackage(name, version);
	}

	async exists(name: string, version: string) {

		try {

			const stat = await fs.stat(path.join(this.GLOBAL_PACKAGES_PATH, this.safeName(name), version));
			return stat.isDirectory();

		}catch {

			return false;

		}


	}

	async remove(name: string, version: string): Promise<boolean> {

		const packagePath = path.join(this.GLOBAL_PACKAGES_PATH, this.safeName(name), version);

		if (!await this.exists(name, version)) return false;

		await fs.rm(packagePath, { recursive: true, force: true });

		const nameDir = path.join(this.GLOBAL_PACKAGES_PATH, this.safeName(name));
		const remainingVersions = await fs.readdir(nameDir).catch(() => []);
		if (remainingVersions.length === 0) await fs.rm(nameDir, { recursive: true, force: true });

		return true;

	}

	async getPackage(name: string, version: string): Promise<CachedPackage | null> {

		const pkgExists = await this.exists(name, version);
		if (!pkgExists) return null;
		const packagePath = path.join(this.GLOBAL_PACKAGES_PATH, this.safeName(name), version);
		const rawPackageJson = await fs.readFile(path.join(packagePath, "package.json"), { encoding: "utf-8" });
		const packageJson = JSON.parse(rawPackageJson);

		const manifestPath = await resolveManifestPath(packagePath);
		if (!manifestPath) return null;

		const manifest = await this.manifestService.load(manifestPath);

		return {
			type: manifest.kind,
			name: packageJson.name,
			version: packageJson.version,
			path: packagePath
		}

	}

	async listPackages(): Promise<CachedPackage[]> {

		try {

			const nameDirs = await fs.readdir(this.GLOBAL_PACKAGES_PATH, { withFileTypes: true });
			const packages: CachedPackage[] = [];

			for (const nameDir of nameDirs.filter(d => d.isDirectory())) {
				const versionDirs = await fs.readdir(
					path.join(this.GLOBAL_PACKAGES_PATH, nameDir.name),
					{ withFileTypes: true }
				);
				for (const versionDir of versionDirs.filter(d => d.isDirectory())) {
					const pkgJsonPath = path.join(this.GLOBAL_PACKAGES_PATH, nameDir.name, versionDir.name, "package.json");
					try {
						const raw = await fs.readFile(pkgJsonPath, { encoding: "utf-8" });
						const { name, version } = JSON.parse(raw);
						const pkg = await this.getPackage(name, version);
						if (pkg) packages.push(pkg);
					} catch { /* skip invalid entries */ }
				}
			}

			return packages;

		} catch {

			return [];

		}

	}



}

async function resolveManifestPath(packagePath: string): Promise<string | null> {
	const rootManifest = path.join(packagePath, "manifest.yaml");
	if (await fs.access(rootManifest).then(() => true).catch(() => false)) return rootManifest;
	const workspaceManifest = path.join(packagePath, "workspace", "manifest.yaml");
	if (await fs.access(workspaceManifest).then(() => true).catch(() => false)) return workspaceManifest;
	return null;
}
