import { injectable } from "tsyringe";
import { ConfigStore } from "../../services/ConfigStore.service.js";

/** Whether the driver is paired — it has a token. */
@injectable()
export class CheckDriverLoggedUseCase {

	constructor(
		private readonly configStore: ConfigStore
	) {}

	async execute(): Promise<Boolean> {

		const config = await this.configStore.read();
		if (!config.token) return false;

		return true;

	}

}
