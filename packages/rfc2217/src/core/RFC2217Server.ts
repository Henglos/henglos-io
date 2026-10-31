
import * as net from "node:net";
import { TelnetParser } from "./TelnetParser.js";
import { TelnetByte } from "./TelnetByte.js";
import { RFC2217Parser } from "./Parser.js";
import { COM_PORT_OPTION } from "./RFC2217Byte.js";

/**
 * A TCP server speaking RFC 2217 (serial port over Telnet): each client
 * gets its own session from `factory`. It negotiates the COM-PORT-OPTION and
 * BINARY options, hands the session the port commands, and passes the data
 * both ways.
 */
export class RFC2217Server {

	private readonly server: net.Server;

	/** @param factory Makes the session for each new client. */
	constructor(private readonly factory: () => RFC2217Parser) {
		this.server = net.createServer(socket => this.handleConnection(socket));
	}

	/**
	 * Starts listening.
	 *
	 * @param port The TCP port — 0 for any free one.
	 * @returns The port it listens on.
	 */
	start(port: number): Promise<number> {
		return new Promise((resolve, reject) => {
			this.server.once("error", reject);
			this.server.listen(port, () => {
				const addr = this.server.address() as net.AddressInfo;
				resolve(addr.port);
			});
		});
	}

	/** Stops listening (the open sessions end as their clients close). */
	stop(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server.close(err => {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	private handleConnection(socket: net.Socket): void {
		const session = this.factory();
		session.write = (data) => { socket.write(data); };

		const telnet = new TelnetParser();

		telnet.onWill = (option) => {
			if (option === COM_PORT_OPTION) {
				socket.write(Buffer.from([TelnetByte.IAC, TelnetByte.DO, COM_PORT_OPTION]));
			} else if (option === TelnetByte.BINARY) {
				socket.write(Buffer.from([TelnetByte.IAC, TelnetByte.DO, TelnetByte.BINARY]));
			}
		};

		telnet.onDont = (option) => {
			if (option === COM_PORT_OPTION) {
				socket.write(Buffer.from([TelnetByte.IAC, TelnetByte.WONT, COM_PORT_OPTION]));
			}
		};

		telnet.onSubnegotiation = (option, data) => {
			if (option === COM_PORT_OPTION) session.parse(data);
		};

		telnet.onData = (data) => {
			session.onData(data);
		};

		socket.on("data",  (chunk: Buffer) => telnet.parse(new Uint8Array(chunk)));
		socket.on("close", () => session.onClose());
		socket.on("error", () => socket.destroy());

		// Advertise RFC2217 + BINARY mode on connect
		socket.write(Buffer.from([
			TelnetByte.IAC, TelnetByte.WILL, COM_PORT_OPTION,
			TelnetByte.IAC, TelnetByte.WILL, TelnetByte.BINARY,
			TelnetByte.IAC, TelnetByte.DO,   TelnetByte.BINARY,
		]));
	}

}
