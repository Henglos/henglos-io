import { SerialPort } from "serialport";
import { injectable } from "tsyringe";
import { RFC2217Server, RFC2217Parser } from "@henglosio/rfc2217";
import { createLogger } from "../../infrastructure/logger/Logger.js";

const log = createLogger("usb");

function openPort(path: string, baudRate: number): Promise<SerialPort> {
	return new Promise((resolve, reject) => {
		const port = new SerialPort({ path, baudRate, autoOpen: false });
		port.open(err => err ? reject(err) : resolve(port));
	});
}

// Awaited, never rejects, never hangs — same pattern as RecordWorkflowUseCase /
// ExecuteSessionsService's closePort. Without this, disconnect() could resolve
// before the OS actually released the handle, and the next task on this port
// (e.g. a record right after a flash) would open it while the previous session
// is still tearing down — the reset pulse it sends can land on a port that
// hasn't settled yet and never reach the device.
function closePort(port: SerialPort): Promise<void> {
	return new Promise(resolve => {
		if (!port.isOpen) return resolve();
		let settled = false;
		const done = () => { if (settled) return; settled = true; resolve(); };
		const timer = setTimeout(done, 2000);
		try {
			port.close(() => { clearTimeout(timer); done(); });
		} catch {
			clearTimeout(timer);
			done();
		}
	});
}

class SerialPortSession extends RFC2217Parser {
	private suspended = false;

	constructor(private readonly serial: SerialPort, private readonly tag: string) {
		super();
		this.serial.on("data", (chunk: Buffer) => {
			log.trace(`${tag} serial→TCP ${chunk.length}B [${Buffer.from(chunk).toString("hex")}]`);
			this.sendData(new Uint8Array(chunk));
		});
		this.serial.on("error", (err) => log.error(`${tag} serial error:`, err));
	}

	onData(data: Uint8Array): void {
		if (!this.suspended && this.serial.isOpen) {
			log.trace(`${this.tag} TCP→serial ${data.length}B`);
			this.serial.write(Buffer.from(data));
		}
	}

	onBaudRate(baud: number): void {
		log.debug(`${this.tag} baud rate ${baud}`);
		if (this.serial.isOpen) this.serial.update({ baudRate: baud }, (err) => {
			if (err) log.error(`${this.tag} couldn't set the baud rate:`, err);
		});
	}

	onDataSize(_bits: number):   void {}
	onParity(_parity: number):   void {}
	onStopSize(_stop: number):   void {}

	onDTR(on: boolean): void { if (this.serial.isOpen) this.serial.set({ dtr: on }, () => {}); }
	onRTS(on: boolean): void { if (this.serial.isOpen) this.serial.set({ rts: on }, () => {}); }

	onFlowControl(_mode: number): void {}
	onFlowSuspend(): void { this.suspended = true; }
	onFlowResume():  void { this.suspended = false; }

	onPurge(_queue: number): void { if (this.serial.isOpen) this.serial.flush(); }

	override onClose(): void {
		if (this.serial.isOpen) this.serial.close();
	}
}

type ActiveEntry = {
	server:  RFC2217Server;
	tcpPort: number;
	serial:  SerialPort;
};

/**
 * Lends a board's serial port to a build container: an RFC 2217 server on a local TCP port
 * that drives the real port — what esptool, inside the container, flashes through.
 */
@injectable()
export class USBTunnel {

	private readonly active = new Map<string, ActiveEntry>();

	initialize(): Promise<void> {
		return Promise.resolve();
	}

	async connect(serialPort: string, baudrate: number): Promise<number> {
		const serial  = await openPort(serialPort, baudrate);
		const server  = new RFC2217Server(() => new SerialPortSession(serial, serialPort));
		const tcpPort = await server.start(0);
		this.active.set(serialPort, { server, tcpPort, serial });
		return tcpPort;
	}

	async disconnect(serialPort: string): Promise<void> {
		const entry = this.active.get(serialPort);
		if (!entry) return;
		this.active.delete(serialPort);
		await entry.server.stop();
		await closePort(entry.serial);
	}

}
