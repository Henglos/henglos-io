import type { FlashBroker } from "../contract/broker.js";
import type { RunnerProtocol } from "../contract/events.js";
import { DriverFlashBroker, LocalFlashBroker } from "./broker.js";
import { DriverClient } from "./http.js";

/**
 * The runner's line to the driver that started it — or to the terminal, when
 * nothing did. What `hio build` / `hio flash` / `hio firmware` work with:
 * - `send`: their logs, phases and errors (a board script's ctx.log);
 * - `broker`: the ways a board can be written (a board script's ctx.send).
 */
export type DriverConnection = {

	send: (payload: RunnerProtocol) => Promise<void>;
	broker: (port: string, baudrate: number) => FlashBroker;

}

/**
 * The connection from the environment the driver starts the container with —
 * the one place that tells "started by a driver" from "in a terminal":
 *
 * - HIO_CALLBACK_URL: each message is POSTed to it, as JSON. A phase goes as one
 *   only to a driver that says it reads them (HIO_RUNNER_PHASES=1); to an older
 *   one, as a log line. Without it, logs and phases go to stdout, errors to stderr.
 * - HIO_BROKER_URL: the driver's broker. Without it (a terminal), the board
 *   can only be written through its serial port.
 *
 * Both go with the session's token, HIO_CALLBACK_TOKEN.
 */
export function connectDriver(env: NodeJS.ProcessEnv = process.env): DriverConnection {
	const token = env["HIO_CALLBACK_TOKEN"];
	const callback = env["HIO_CALLBACK_URL"];
	const brokerUrl = env["HIO_BROKER_URL"];

	return {
		send: callback ? sendToDriver(callback, token, env["HIO_RUNNER_PHASES"] === "1") : sendToTerminal,
		broker: (port, baudrate) => brokerUrl
			? new DriverFlashBroker(new DriverClient(brokerUrl, token))
			: new LocalFlashBroker(port, baudrate, env),
	};
}

const phaseLine = (phase: string) => `── ${phase} ──\n`;

async function sendToTerminal(payload: RunnerProtocol): Promise<void> {
	if (payload.type === "data") process.stdout.write(payload.data);
	else if (payload.type === "phase") process.stdout.write(phaseLine(payload.phase));
	else process.stderr.write(`[error:${payload.id}] ${payload.data}\n`);
}

function sendToDriver(url: string, token: string | undefined, phases: boolean): (payload: RunnerProtocol) => Promise<void> {
	return async (payload) => {
		if (payload.type === "phase" && !phases) payload = { type: "data", data: phaseLine(payload.phase) };
		await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
			body: JSON.stringify(payload),
		});
	};
}
