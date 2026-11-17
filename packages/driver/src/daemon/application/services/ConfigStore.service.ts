import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { injectable } from "tsyringe";

/**
 * What the driver keeps between runs (~/.henglos/io/driver/config.json): the hosting's
 * address and its tokens.
 */
export interface DriverConfig {
	baseUrl: string | null;
	token: string | null;
	refreshToken: string | null;
}

const DEFAULT_CONFIG: DriverConfig = {
	baseUrl: null,
	token: null,
	refreshToken: null,
};

/** Reads and writes the driver's config file (~/.henglos/io/driver/config.json). */
@injectable()
export class ConfigStore {
	
	private readonly configDir: string = path.join(os.homedir(), ".henglos", "io", "driver");
	private readonly configFilePath: string = path.join(this.configDir, "config.json");

	constructor() {}

	async initialize(): Promise<void> {
		const exists = await fs
			.access(this.configFilePath)
			.then(() => true)
			.catch(() => false);
		if (!exists) await this.write(DEFAULT_CONFIG);
	}

	async read(): Promise<DriverConfig> {
		try {
			const raw = await fs.readFile(this.configFilePath, "utf-8");
			// `hwid` was the machine's id, which older drivers kept — dropped on the next save.
			const { hwid: _hwid, ...config } = JSON.parse(raw) as DriverConfig & { hwid?: unknown };
			return { ...DEFAULT_CONFIG, ...config };
		} catch {
			return { ...DEFAULT_CONFIG };
		}
	}

	async save(partial: Partial<DriverConfig>): Promise<void> {
		const current = await this.read();
		await this.write({ ...current, ...partial });
	}

	// `hio driver configure` may be the first thing to run on this machine.
	private async write(config: DriverConfig): Promise<void> {
		await fs.mkdir(this.configDir, { recursive: true });
		await fs.writeFile(
			this.configFilePath,
			JSON.stringify(config, null, 4),
			"utf-8",
		);
	}
}
