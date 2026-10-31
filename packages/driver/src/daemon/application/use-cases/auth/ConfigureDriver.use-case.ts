import { injectable } from "tsyringe";
import { ConfigStore } from "../../services/ConfigStore.js";

/** `hio driver configure <server>`: sets the hosting the driver connects to. */
@injectable()
export class ConfigureDriverUseCase {

	constructor(
		private readonly configStore: ConfigStore,
	) {}

	async execute(baseUrl: string): Promise<void> {

		const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

		await this.configStore.save({ baseUrl: normalizedBaseUrl });

		console.log(`[config] HenglosIO server set to ${normalizedBaseUrl}.`);

	}

}
