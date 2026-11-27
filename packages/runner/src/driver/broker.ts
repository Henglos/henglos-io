import type { BrokerConnection, BrokerConnectRequest, FlashBroker, FlashMethodName, FlashMethodRequest, FlashMethodSendOptions } from "../contract/broker.js";
import { DriverClient, DriverError } from "./http.js";
import { flashMethods, resolveSerialUrl } from "./methods.js";

/** Splits `ctx.send`'s options: what goes to the driver, and what stays here. */
function requestOf<K extends FlashMethodName>(name: K, options: FlashMethodSendOptions<K>): FlashMethodRequest<K> {
	const local = new Set<PropertyKey>(flashMethods[name].local);
	return Object.fromEntries(Object.entries(options).filter(([key]) => !local.has(key))) as FlashMethodRequest<K>;
}

/** The broker for a Runner the driver started: each call goes to it. */
export class DriverFlashBroker implements FlashBroker {

	private readonly client: DriverClient;

	constructor(client: DriverClient) {
		this.client = client;
	}

	send = async <K extends FlashMethodName>(name: K, options: FlashMethodSendOptions<K>): Promise<void> => {
		const request: BrokerConnectRequest<K> = { method: name, options: requestOf(name, options) };
		const answer = await this.client.post<BrokerConnection<K>>("/connections", request);
		try {
			await flashMethods[name].write(answer.connection, options, this.client);
		} finally {
			// The write's own error is the one worth reporting: a release that fails
			// after it is the driver's to clean up when the session ends.
			await this.client.delete(`/connections/${encodeURIComponent(answer.id)}`).catch(() => {});
		}
	};

}

/**
 * The broker without a driver (`hio flash` in a terminal): the serial port it
 * was given, and nothing else.
 */
export class LocalFlashBroker implements FlashBroker {

	private readonly url: string | null;
	private readonly baudrate: number;

	constructor(port: string | undefined, baudrate: number, env: NodeJS.ProcessEnv = process.env) {
		this.url = port ? resolveSerialUrl(port, env) : null;
		this.baudrate = baudrate;
	}

	send = async <K extends FlashMethodName>(name: K, options: FlashMethodSendOptions<K>): Promise<void> => {
		if (name !== "serial") throw new DriverError("method_unsupported", `Without the driver, a board can only be written through its serial port, not ${name}.`);
		if (!this.url) throw new DriverError("bad_request", "No serial port to write the board through — pass --port.");
		const serial = options as FlashMethodSendOptions<"serial">;
		await serial.write({ url: this.url, baudrate: serial.baudrate ?? this.baudrate });
	};

}
