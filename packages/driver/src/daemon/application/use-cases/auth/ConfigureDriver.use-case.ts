import { injectable } from "tsyringe";
import { ConfigStore } from "../../services/ConfigStore.service.js";
import { createLogger } from "../../../infrastructure/logger/Logger.js";

const log = createLogger("config");

/** `hio driver configure <server>`: sets the hosting the driver connects to. */
@injectable()
export class ConfigureDriverUseCase {

	constructor(
		private readonly configStore: ConfigStore,
	) {}

	async execute(baseUrl: string): Promise<void> {

		const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

		await this.configStore.save({ baseUrl: normalizedBaseUrl });

		log.success(`Henglos IO server set to ${normalizedBaseUrl}`);

	}

}
