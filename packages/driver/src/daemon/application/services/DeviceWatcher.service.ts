import { SerialPort } from "serialport";
import type { Device } from "@henglosio/shared";
import { injectable } from "tsyringe";
import { SocketIOClient } from "../../infrastructure/ws/SocketIOClient.impl.js";

/**
 * Watches the serial ports (every 2 s) and tells the hosting when a board is plugged in
 * or unplugged.
 */
@injectable()
export class DeviceWatcher {
	private timer: NodeJS.Timeout | null = null;
	private knownPorts                   = new Map<string, Device>();

	private readonly intervalMs = 2_000;
	
	constructor(
		private readonly ws: SocketIOClient,
	) {}

	async start(): Promise<void> {
		const ports   = await SerialPort.list();
		const devices = ports.map(p => toDevice(p));

		for (const device of devices) {
			this.knownPorts.set(device.port, device);
		}

		this.ws.socket?.emit("device:list", devices);
		this.timer = setInterval(() => void this.poll(), this.intervalMs);
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private async poll(): Promise<void> {
		if (!this.ws.isConnected()) return;

		const ports   = await SerialPort.list();
		const current = new Map<string, Device>(ports.map(p => [p.path, toDevice(p)]));

		for (const [path, device] of current) {
			if (!this.knownPorts.has(path)) {
				this.ws.socket?.emit("device:connected", device);
			}
		}

		for (const [path, device] of this.knownPorts) {
			if (!current.has(path)) {
				this.ws.socket?.emit("device:disconnected", device);
			}
		}

		this.knownPorts = current;
	}
}

function toDevice(p: { path: string; vendorId?: string; productId?: string; manufacturer?: string }): Device {
	return {
		port:      p.path,
		usbId:     p.vendorId ? `${p.vendorId}:${p.productId ?? ""}` : undefined,
		usbVendor: p.manufacturer ?? undefined,
	};
}
