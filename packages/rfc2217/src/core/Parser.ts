
import { TelnetByte } from "./TelnetByte.js";
import { COM_PORT_OPTION, RFC2217Cmd, RFC2217Rsp, RFC2217Control } from "./RFC2217Byte.js";

// Doubles every 0xFF (IAC) byte — how Telnet carries a literal 0xFF in data.
function escapeIAC(data: Uint8Array): Uint8Array {
	let extras = 0;
	for (const byte of data) {
		if (byte === TelnetByte.IAC) extras++;
	}
	if (extras === 0) return data;
	const out = new Uint8Array(data.length + extras);
	let i = 0;
	for (const byte of data) {
		out[i++] = byte;
		if (byte === TelnetByte.IAC) out[i++] = TelnetByte.IAC;
	}
	return out;
}

/**
 * One RFC 2217 session — a client driving a serial port over the network.
 * Decodes the COM-PORT-OPTION commands (baud rate, data bits, parity, DTR/RTS,
 * flow control, purge), answers each as the RFC asks, and calls the matching
 * `on…` hook. A subclass connects the hooks to a real serial port (the
 * driver's USBTunnel), and sends what the port reads with sendData().
 */
export abstract class RFC2217Parser {

	// Injected by RFC2217Server — writes raw bytes back to the TCP socket
	write?: (data: Uint8Array) => void;

	// Called by RFC2217Server for each COM-PORT-OPTION subnegotiation payload
	parse(data: Uint8Array): void {
		if (data.length === 0) return;
		const cmd = data[0];
		if (cmd === undefined) return;

		switch (cmd) {

			case RFC2217Cmd.SET_BAUDRATE: {
				if (data.length < 5) return;
				const baud = new DataView(data.buffer, data.byteOffset + 1, 4).getUint32(0, false);
				const payload = new Uint8Array(4);
				new DataView(payload.buffer).setUint32(0, baud, false);
				this.respond(RFC2217Rsp.SET_BAUDRATE, payload);
				this.onBaudRate(baud);
				break;
			}

			case RFC2217Cmd.SET_DATASIZE: {
				const bits = data[1];
				if (bits === undefined) return;
				this.respond(RFC2217Rsp.SET_DATASIZE, new Uint8Array([bits]));
				this.onDataSize(bits);
				break;
			}

			case RFC2217Cmd.SET_PARITY: {
				const parity = data[1];
				if (parity === undefined) return;
				this.respond(RFC2217Rsp.SET_PARITY, new Uint8Array([parity]));
				this.onParity(parity);
				break;
			}

			case RFC2217Cmd.SET_STOPSIZE: {
				const stop = data[1];
				if (stop === undefined) return;
				this.respond(RFC2217Rsp.SET_STOPSIZE, new Uint8Array([stop]));
				this.onStopSize(stop);
				break;
			}

			case RFC2217Cmd.SET_CONTROL: {
				const value = data[1];
				if (value === undefined) return;
				this.respond(RFC2217Rsp.SET_CONTROL, new Uint8Array([value]));
				switch (value) {
					case RFC2217Control.DTR_ON:  this.onDTR(true);  break;
					case RFC2217Control.DTR_OFF: this.onDTR(false); break;
					case RFC2217Control.RTS_ON:  this.onRTS(true);  break;
					case RFC2217Control.RTS_OFF: this.onRTS(false); break;
					default:                     this.onFlowControl(value); break;
				}
				break;
			}

			case RFC2217Cmd.FLOWCONTROL_SUSPEND: {
				this.respond(RFC2217Rsp.FLOWCONTROL_SUSPEND);
				this.onFlowSuspend();
				break;
			}

			case RFC2217Cmd.FLOWCONTROL_RESUME: {
				this.respond(RFC2217Rsp.FLOWCONTROL_RESUME);
				this.onFlowResume();
				break;
			}

			case RFC2217Cmd.PURGE_DATA: {
				const queue = data[1];
				if (queue === undefined) return;
				this.respond(RFC2217Rsp.PURGE_DATA, new Uint8Array([queue]));
				this.onPurge(queue);
				break;
			}
		}
	}

	// Send raw serial data to the client (escapes IAC bytes)
	protected sendData(data: Uint8Array): void {
		this.write?.(escapeIAC(data));
	}

	// Build and send IAC SB COM-PORT-OPTION command [payload] IAC SE
	protected respond(command: number, payload: Uint8Array = new Uint8Array(0)): void {
		const escaped = escapeIAC(payload);
		// frame: IAC SB OPT CMD [payload] IAC SE  = 6 + escaped.length bytes
		const frame = new Uint8Array(6 + escaped.length);
		frame[0] = TelnetByte.IAC;
		frame[1] = TelnetByte.SB;
		frame[2] = COM_PORT_OPTION;
		frame[3] = command;
		frame.set(escaped, 4);
		frame[4 + escaped.length] = TelnetByte.IAC;
		frame[5 + escaped.length] = TelnetByte.SE;
		this.write?.(frame);
	}

	// Called by RFC2217Server when raw serial data arrives from the client
	abstract onData(data: Uint8Array): void;

	// Serial port configuration
	abstract onBaudRate(baud: number): void;
	abstract onDataSize(bits: number): void;
	abstract onParity(parity: number): void;
	abstract onStopSize(stop: number): void;

	// Modem control signals
	abstract onDTR(on: boolean): void;
	abstract onRTS(on: boolean): void;

	// Flow control
	abstract onFlowControl(mode: number): void;
	abstract onFlowSuspend(): void;
	abstract onFlowResume(): void;

	// Data management
	abstract onPurge(queue: number): void;

	// Called by RFC2217Server when the TCP client disconnects
	onClose(): void {}

}
