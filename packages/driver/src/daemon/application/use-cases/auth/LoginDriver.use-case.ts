import * as os from "os";
import axios, { AxiosError } from "axios";
import { getMachineIdSync } from "native-machine-id";
import { injectable } from "tsyringe";
import type { PairDriverIn, PairDriverOut } from "@henglosio/shared";
import { ConfigStore } from "../../services/ConfigStore.service.js";
import { serverHttpAgent, serverHttpsAgent } from "../../../infrastructure/ws/serverAgents.js";
import { createLogger } from "../../../infrastructure/logger/Logger.js";

const log = createLogger("auth");

/**
 * `hio driver login <pairToken> <name>`: pairs this machine with the account the pair token
 * is from, and keeps the tokens it gets. Needs `hio driver configure` first.
 */
@injectable()
export class LoginDriverUseCase {

	constructor(
		private readonly configStore: ConfigStore,
	) {}

	async execute(pairToken: string, name: string): Promise<void> {

		const { baseUrl } = await this.configStore.read();
		if (!baseUrl) throw new Error("[auth] No server configured. Run 'hio driver configure <baseUrl>' first.");

		const hwid = getMachineIdSync();
		if (!hwid) throw new Error("[auth] Try run as admin.");

		const deviceUser = os.userInfo().username;
		const deviceName = os.hostname();

		log.start(`Pairing with ${baseUrl}`);

		let data: PairDriverOut;
		try {
			({ data } = await axios.post<PairDriverOut>(
				`${baseUrl}/io/api/v1/drivers/pair/${pairToken}`,
				{
					name,
					deviceHWID: hwid,
					deviceName,
					deviceUser,
				} satisfies PairDriverIn,
				{ httpAgent: serverHttpAgent(), httpsAgent: serverHttpsAgent() },
			));
		} catch (e) {
			throw new Error(`[auth] Pairing failed: ${describePairError(e, baseUrl)}`);
		}

		await this.configStore.save({
			hwid,
			token: data.token,
			refreshToken: data.refreshToken,
		});

		log.success("Paired — start it with 'hio driver start'");

	}

}

function describePairError(e: unknown, baseUrl: string): string {

	if (!(e instanceof AxiosError)) return (e as Error).message;

	if (e.response) {
		const body = e.response.data as { message?: string } | undefined;
		return `server responded ${e.response.status}${body?.message ? ` — ${body.message}` : ""} (check the pair token — each one is single-use).`;
	}

	// "wrong version number" = spoke TLS to a plaintext HTTP port.
	if (/wrong version number/i.test(e.message)) {
		return `'${baseUrl}' is HTTPS but the server is serving plain HTTP. Use 'hio driver configure http://…' (or point at the Caddy HTTPS URL, e.g. https://hio.localhost).`;
	}

	if (e.code === "ECONNREFUSED") {
		return `nothing is listening at '${baseUrl}'. Is the hosting server running?`;
	}

	return `${e.code ?? "network error"}: ${e.message}`;
}
