import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import pacote from "pacote";
import { injectable } from "tsyringe";

const PLATFORMS_DIR = path.join(os.homedir(), ".henglos", "io", "driver", "platforms");
// The npm registry packages come from: HIO_REGISTRY_URL — the hosting's own
// setting, so one name points both at the same registry (the dev Gitea:
// http://localhost:3000/api/packages/henglosio/npm/). HENGLOS_REGISTRY, its
// earlier name, still works. The public npm registry otherwise.
const DEFAULT_REGISTRY = "https://registry.npmjs.org/";

function registryUrl(): string {
	return process.env["HIO_REGISTRY_URL"] || process.env["HENGLOS_REGISTRY"] || DEFAULT_REGISTRY;
}

/**
 * The platform versions the driver has (~/.henglos/io/driver/platforms), installed from the
 * registry (HIO_REGISTRY_URL).
 */
@injectable()
export class PlatformService {

	constructor() {}

	async initialize(): Promise<void> {
		await fs.mkdir(PLATFORMS_DIR, { recursive: true });
	}

	async exists(name: string, version: string): Promise<boolean> {
		return fs.access(path.join(PLATFORMS_DIR, name, version)).then(() => true).catch(() => false);
	}

	async resolve(name: string, version: string): Promise<string> {
		const platformDir = path.join(PLATFORMS_DIR, name, version);

		if (!(await this.exists(name, version))) {
			await fs.mkdir(platformDir, { recursive: true });
			await pacote.extract(`${name}@${version}`, platformDir, { registry: registryUrl() });
		}

		return platformDir;
	}

}
