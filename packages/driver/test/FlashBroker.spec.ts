import "reflect-metadata";      // the services are tsyringe @injectable()s
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { connectDriver, DriverClient, DriverFlashBroker, LocalFlashBroker, resolveSerialUrl, type RunnerProtocol } from "@henglosio/runner";
import type { FlashTarget } from "@henglosio/shared";

import { ContainerTunnel } from "../src/daemon/application/services/ContainerTunnel.service.js";
import { FlashBrokerService, type FlashBrokerSession } from "../src/daemon/application/services/FlashBroker.service.js";
import type { UF2Drives } from "../src/daemon/application/services/UF2Drives.service.js";
import type { USBTunnel } from "../src/daemon/application/services/USBTunnel.service.js";

// The tunnel on the loopback — what Docker Desktop forwards host.docker.internal to.
const tunnel = new ContainerTunnel();
beforeAll(() => tunnel.initialize("127.0.0.1"));
afterAll(() => tunnel.shutdown());

const loopback = (url: string) => url.replace("host.docker.internal", "127.0.0.1");

// A USB tunnel that only counts: the ports it lent, and what's open.
class FakeUSBTunnel {
	open = new Set<string>();
	connects = 0;
	async connect(port: string): Promise<number> { this.connects++; this.open.add(port); return 40000 + this.connects; }
	async disconnect(port: string): Promise<void> { this.open.delete(port); }
}

// A UF2 drive in a temp folder, labelled RPI-RP2: there or not, and a board
// that "restarts" — the drive goes away — once firmware.uf2 lands in it.
class FakeDrives {
	mounted = false;
	bootloaderCalls: string[] = [];
	appearsInBootloader = true;
	constructor(readonly folder: string) {}
	async find(volume: string): Promise<string | null> {
		if ((volume !== "RPI-RP2" && volume !== this.folder) || !this.mounted) return null;
		if (fs.existsSync(path.join(this.folder, "firmware.uf2"))) { this.mounted = false; return null; }
		return this.folder;
	}
	async enterBootloader(port: string): Promise<void> {
		this.bootloaderCalls.push(port);
		if (this.appearsInBootloader) setTimeout(() => { this.mounted = true; }, 100);
	}
}

// One flash: its broker session, served by the tunnel, and a Runner's broker
// talking to it. The driver answers with the container's address — the
// Runner's client reaches it on the loopback here.
type Flash = { usb: FakeUSBTunnel; drives: FakeDrives; session: FlashBrokerSession; broker: DriverFlashBroker; brokerUrl: string; token: string; firmware: string };
const flashes: { id: string; drives: FakeDrives; firmware: string }[] = [];
let next = 0;

function startFlash(target: (folder: string) => FlashTarget): Flash {
	const usb = new FakeUSBTunnel();
	const drives = new FakeDrives(fs.mkdtempSync(path.join(os.tmpdir(), "uf2-")));
	const session = new FlashBrokerService(usb as unknown as USBTunnel, drives as unknown as UF2Drives)
		.createSession({ target: target(drives.folder), tunnelHost: "host.docker.internal" });
	const id = `flash-${next++}`;
	const created = tunnel.createSession(id, () => {}, session);
	const client = new DriverClient(loopback(created.brokerUrl), created.token);
	const upload = client.upload.bind(client);
	client.upload = (url, file) => upload(loopback(url), file);
	const firmware = path.join(os.tmpdir(), `fw-${path.basename(drives.folder)}.uf2`);
	fs.writeFileSync(firmware, Buffer.alloc(4096, 0xab));
	flashes.push({ id, drives, firmware });
	return { usb, drives, session, broker: new DriverFlashBroker(client), brokerUrl: created.brokerUrl, token: created.token, firmware };
}

afterEach(() => {
	for (const { id, drives, firmware } of flashes.splice(0)) {
		tunnel.destroySession(id);
		fs.rmSync(drives.folder, { recursive: true, force: true });
		fs.rmSync(firmware, { force: true });
	}
});

const connections = (session: FlashBrokerSession) => (session as unknown as { connections: Map<string, unknown> }).connections;
const serialTarget: FlashTarget = { method: "serial", port: "COM7" };
const uf2Target = (volume: string): FlashTarget => ({ method: "uf2", port: "COM7", volume });

describe("flash broker", () => {

	test("refuses a call without the session's token", async () => {
		const { brokerUrl } = startFlash(() => serialTarget);
		const response = await fetch(`${loopback(brokerUrl)}/connections`, { method: "POST", body: JSON.stringify({ method: "serial", options: {} }) });
		expect(response.status).toBe(401);
		const other = new DriverFlashBroker(new DriverClient(loopback(brokerUrl), "not-a-token"));
		await expect(other.send("serial", { write: async () => {} })).rejects.toMatchObject({ status: 401 });
	});

	test("a session without a broker answers not_found", async () => {
		const plain = tunnel.createSession("event-only", () => {});
		const client = new DriverFlashBroker(new DriverClient(loopback(plain.brokerUrl), plain.token));
		await expect(client.send("serial", { write: async () => {} })).rejects.toMatchObject({ id: "not_found", status: 404 });
		tunnel.destroySession("event-only");
	});

	test("serial: write gets the tunnel, opened on demand, and the connection is released after", async () => {
		const { usb, session, broker } = startFlash(() => serialTarget);
		expect(usb.open.size).toBe(0);
		const seen: unknown[] = [];
		await broker.send("serial", { baudrate: 921600, write: async (connection) => { seen.push(connection); } });
		expect(seen).toEqual([{ url: "rfc2217://host.docker.internal:40001", baudrate: 921600 }]);
		expect(connections(session).size).toBe(0);
		await session.destroy();
		expect(usb.open.size).toBe(0);
	});

	test("serial: the target's baudrate wins over the script's", async () => {
		const { broker } = startFlash(() => ({ method: "serial", port: "COM7", baudrate: 115200 }));
		const seen: { baudrate: number }[] = [];
		await broker.send("serial", { baudrate: 921600, write: async (c) => { seen.push(c); } });
		expect(seen[0]!.baudrate).toBe(115200);
	});

	test("serial: a failed write is reported, and still released", async () => {
		const { session, broker } = startFlash(() => serialTarget);
		await expect(broker.send("serial", { write: async () => { throw new Error("esptool failed"); } })).rejects.toThrow("esptool failed");
		expect(connections(session).size).toBe(0);
	});

	test("a method other than the target's is method_unsupported", async () => {
		const { broker, firmware } = startFlash(() => serialTarget);
		await expect(broker.send("uf2", { file: firmware })).rejects.toMatchObject({ id: "method_unsupported" });
	});

	test("uf2: a label not mounted restarts the board through the target's port, then copies the file", async () => {
		const { drives, broker, firmware } = startFlash(() => uf2Target("RPI-RP2"));
		await broker.send("uf2", { file: firmware });

		expect(drives.bootloaderCalls).toEqual(["COM7"]);
		expect(fs.readFileSync(path.join(drives.folder, "firmware.uf2"))).toEqual(fs.readFileSync(firmware));
	});

	test("uf2: a mounted volume, by its path, is written without a restart", async () => {
		const { drives, broker, firmware } = startFlash(folder => uf2Target(folder));
		drives.mounted = true;
		await broker.send("uf2", { file: firmware });

		expect(drives.bootloaderCalls).toEqual([]);
		expect(fs.existsSync(path.join(drives.folder, "firmware.uf2"))).toBe(true);
	});

	test("uf2: a drive that never shows up is device_unavailable", async () => {
		const { drives, broker, firmware } = startFlash(() => uf2Target("RPI-RP2"));
		drives.appearsInBootloader = false;
		await expect(broker.send("uf2", { timeoutMs: 300, file: firmware })).rejects.toMatchObject({ id: "device_unavailable" });
	});

	test("an unknown method is method_unsupported", async () => {
		const { brokerUrl, token } = startFlash(() => serialTarget);
		const response = await fetch(`${loopback(brokerUrl)}/connections`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: JSON.stringify({ method: "jtag", options: {} }),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ id: "method_unsupported" });
	});

	test("destroy() lets go of what wasn't released", async () => {
		const { usb, session, brokerUrl, token } = startFlash(() => serialTarget);
		await new DriverClient(loopback(brokerUrl), token).post("/connections", { method: "serial", options: {} });
		expect(usb.open.has("COM7")).toBe(true);
		await session.destroy();
		expect(connections(session).size).toBe(0);
		expect(usb.open.has("COM7")).toBe(false);
	});

});

describe("without the driver's broker", () => {

	test("the serial port goes through the driver's tunnel when it lent one", () => {
		expect(resolveSerialUrl("COM3", { USB_TUNNEL_PORT: "40123" })).toBe("rfc2217://host.docker.internal:40123");
		expect(resolveSerialUrl("COM3", { USB_TUNNEL_PORT: "40123", USB_TUNNEL_HOST: "10.0.0.2" })).toBe("rfc2217://10.0.0.2:40123");
		expect(resolveSerialUrl("/dev/ttyUSB0", {})).toBe("/dev/ttyUSB0");
	});

	test("LocalFlashBroker writes through serial only", async () => {
		const local = new LocalFlashBroker("COM3", 460800, {});
		const seen: unknown[] = [];
		await local.send("serial", { write: async (c) => { seen.push(c); } });
		expect(seen).toEqual([{ url: "COM3", baudrate: 460800 }]);
		await expect(local.send("uf2", { file: "x.uf2" })).rejects.toMatchObject({ id: "method_unsupported" });
	});

});

describe("connectDriver", () => {

	test("with the driver's env: messages go to its callback, the broker is its", async () => {
		const received: RunnerProtocol[] = [];
		const created = tunnel.createSession("connect-1", payload => received.push(payload));
		const driver = connectDriver({
			HIO_CALLBACK_URL: loopback(created.url),
			HIO_BROKER_URL: loopback(created.brokerUrl),
			HIO_CALLBACK_TOKEN: created.token,
			HIO_RUNNER_PHASES: "1",
		});

		await driver.send({ type: "data", data: "hello" });
		await driver.send({ type: "phase", phase: "flash" });
		expect(received).toEqual([{ type: "data", data: "hello" }, { type: "phase", phase: "flash" }]);
		expect(driver.broker("COM7", 460800)).toBeInstanceOf(DriverFlashBroker);
		tunnel.destroySession("connect-1");
	});

	test("an older driver gets a phase as a log line", async () => {
		const received: RunnerProtocol[] = [];
		const created = tunnel.createSession("connect-2", payload => received.push(payload));
		await connectDriver({ HIO_CALLBACK_URL: loopback(created.url), HIO_CALLBACK_TOKEN: created.token })
			.send({ type: "phase", phase: "build" });
		expect(received).toEqual([{ type: "data", data: "── build ──\n" }]);
		tunnel.destroySession("connect-2");
	});

	test("without a broker URL, the broker is the local one", () => {
		expect(connectDriver({}).broker("COM3", 460800)).toBeInstanceOf(LocalFlashBroker);
	});

});
