import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { BrokerConnection, BrokerConnectRequest, FlashMethodConnection, FlashMethodRequest } from "@henglosio/runner";
import type { FlashTarget } from "@henglosio/shared";
import { injectable } from "tsyringe";
import { BrokerFailure, type BrokerSession } from "./ContainerTunnel.service.js";
import { REPL_BAUDRATE } from "./ReplSession.service.js";
import { UF2Drives } from "./UF2Drives.service.js";
import { USBTunnel } from "./USBTunnel.service.js";
import { createLogger } from "../../infrastructure/logger/Logger.js";

const log = createLogger("broker");

// esptool's speed once connected, when neither the target nor the script names
// one — the tunnel opens the port at the REPL's speed, esptool raises it over RFC2217.
const DEFAULT_SERIAL_BAUDRATE = 460800;
// How long a UF2 drive gets to show up, and to go away once written.
const UF2_TIMEOUT_MS = 15_000;
const UF2_GONE_TIMEOUT_MS = 10_000;
const POLL_MS = 250;

type Connection =
	| { method: "serial" }
	| { method: "uf2"; volume: string; mount: string };

/** What a flash's broker works with. */
export type FlashBrokerTarget = {

	/** Where and how the studio has the firmware written. */
	target: FlashTarget;
	/** Where the container reaches the host's tunnels. */
	tunnelHost: string;

}

/**
 * The driver's side of the flash broker (@henglosio/runner's contract/broker.ts):
 * one session per flash, served by ContainerTunnel under /broker/<task>.
 */
@injectable()
export class FlashBrokerService {

	constructor(
		private readonly usbTunnel: USBTunnel,
		private readonly drives: UF2Drives,
	) {}

	createSession(target: FlashBrokerTarget): FlashBrokerSession {
		return new FlashBrokerSession(target, this.usbTunnel, this.drives);
	}

}

/**
 * A flash's broker: it sets up the method the flash target names — and only
 * that one — and holds the connections. The flash ends with destroy(), which
 * lets go of whatever the Runner didn't release, the serial tunnel included.
 */
export class FlashBrokerSession implements BrokerSession {

	private readonly connections = new Map<string, Connection>();
	private readonly target: FlashTarget;
	private readonly tunnelHost: string;
	private tunnelPort: number | null = null;

	constructor(
		{ target, tunnelHost }: FlashBrokerTarget,
		private readonly usbTunnel: USBTunnel,
		private readonly drives: UF2Drives,
	) {
		this.target = target;
		this.tunnelHost = tunnelHost;
	}

	async connect(request: BrokerConnectRequest, baseUrl: string): Promise<BrokerConnection> {
		if (request.method !== this.target.method) {
			throw new BrokerFailure("method_unsupported", `This flash writes the board by ${this.target.method}, not ${String(request.method)} — pick ${String(request.method)} in the studio.`);
		}
		const id = randomUUID();
		switch (request.method) {
			case "serial": {
				const connection = await this.connectSerial(request.options as FlashMethodRequest<"serial">);
				this.connections.set(id, { method: "serial" });
				return { id, method: "serial", connection };
			}
			case "uf2": {
				const { volume, mount } = await this.connectUF2(request.options as FlashMethodRequest<"uf2">);
				this.connections.set(id, { method: "uf2", volume, mount });
				const connection: FlashMethodConnection<"uf2"> = { uploadUrl: `${baseUrl}/connections/${id}/upload`, volume: mount };
				return { id, method: "uf2", connection };
			}
		}
	}

	async release(id: string): Promise<void> {
		this.connections.delete(id);
	}

	async upload(id: string, body: ReadableStream<Uint8Array>): Promise<void> {
		const connection = this.connections.get(id);
		if (!connection) throw new BrokerFailure("not_found", "No such connection — released, or never made.", 404);
		if (connection.method !== "uf2") throw new BrokerFailure("bad_request", `A ${connection.method} connection takes no upload.`);

		const file = path.join(connection.mount, "firmware.uf2");
		log.info(`Writing ${file}`);
		try {
			await pipeline(Readable.fromWeb(body as NodeReadableStream<Uint8Array>), createWriteStream(file));
		} catch (err) {
			// The board restarts as soon as it has the whole image — sometimes
			// before the file is closed. Gone, it got it; still there, it didn't.
			if (await this.drives.find(connection.volume)) {
				throw new BrokerFailure("device_unavailable", `Couldn't write to ${connection.mount}: ${err instanceof Error ? err.message : String(err)}`, 500);
			}
		}

		// Written: the board restarts out of its bootloader and the drive goes away.
		if (!(await this.waitFor(async () => !(await this.drives.find(connection.volume)), UF2_GONE_TIMEOUT_MS))) {
			log.warn(`${connection.mount} is still there after the write — the board may not have taken it.`);
		}
	}

	/** The flash ended: what the Runner didn't release goes, and the serial tunnel closes. */
	async destroy(): Promise<void> {
		this.connections.clear();
		if (this.tunnelPort !== null) {
			this.tunnelPort = null;
			await this.usbTunnel.disconnect(this.target.port).catch(() => {});
		}
	}

	// The board's port, lent to the container over RFC 2217 — opened the first
	// time it's asked for.
	private async connectSerial(options: FlashMethodRequest<"serial">): Promise<FlashMethodConnection<"serial">> {
		this.tunnelPort ??= await this.usbTunnel.connect(this.target.port, REPL_BAUDRATE);
		const preset = this.target.method === "serial" ? this.target.baudrate : undefined;
		return {
			url: `rfc2217://${this.tunnelHost}:${this.tunnelPort}`,
			baudrate: preset ?? options.baudrate ?? DEFAULT_SERIAL_BAUDRATE,
		};
	}

	// The target's drive: there already, or once the board restarts in its
	// bootloader through the target's port.
	private async connectUF2(options: FlashMethodRequest<"uf2">): Promise<{ volume: string; mount: string }> {
		if (this.target.method !== "uf2") throw new BrokerFailure("method_unsupported", "This flash has no UF2 drive.");
		const { volume, port } = this.target;
		const timeoutMs = options.timeoutMs ?? UF2_TIMEOUT_MS;

		let mount = await this.drives.find(volume);
		if (!mount) {
			log.info(`${volume} isn't there — restarting the board on ${port} in its bootloader`);
			try {
				await this.drives.enterBootloader(port);
			} catch (err) {
				throw new BrokerFailure("device_unavailable", `${volume} isn't there, and the board on ${port} couldn't be restarted in its bootloader: ${err instanceof Error ? err.message : String(err)}`, 409);
			}
			await this.waitFor(async () => (mount = await this.drives.find(volume)) !== null, timeoutMs);
		}
		if (!mount) throw new BrokerFailure("device_unavailable", `${volume} didn't show up in ${Math.round(timeoutMs / 1000)}s — is the board in its bootloader?`, 409);
		return { volume, mount };
	}

	// Polls `done` until it's true (→ true) or `timeoutMs` passes (→ false).
	private async waitFor(done: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
		const until = Date.now() + timeoutMs;
		for (;;) {
			if (await done()) return true;
			if (Date.now() >= until) return false;
			await new Promise(resolve => setTimeout(resolve, POLL_MS));
		}
	}

}
