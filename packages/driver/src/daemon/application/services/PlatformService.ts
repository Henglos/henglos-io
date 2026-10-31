import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import pacote from "pacote";
import { injectable } from "tsyringe";

const PLATFORMS_DIR = path.join(os.homedir(), ".henglos", "io", "driver", "platforms");
// The public npm registry. In development, point HENGLOS_REGISTRY at the
// local Verdaccio (http://localhost:4873).
const DEFAULT_REGISTRY = "https://registry.npmjs.org/";

function registryUrl(): string {
	return process.env["HENGLOS_REGISTRY"] ?? DEFAULT_REGISTRY;
}

/**
 * The platform versions the driver has (~/.henglos/io/driver/platforms), installed from the
 * registry (HENGLOS_REGISTRY).
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
