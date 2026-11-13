import { io, Socket } from "socket.io-client";
import { injectable } from "tsyringe";
import { serverHttpAgent, serverHttpsAgent } from "./serverAgents.js";
import { createLogger } from "../logger/Logger.js";

const log = createLogger("ws");

/** The driver's socket to the hosting (/io/ws, namespace /driver), authenticated with its token. */
@injectable()
export class SocketIOClient {
	
	public socket: Socket | null = null;

	/**
	 * Connects to the hosting at `host` (ws:// or wss://). Reconnects on its
	 * own after a drop — except when the hosting refused it (see "disconnect").
	 */
	async connect(host: string, token: string): Promise<void> {
		// The agent must match the scheme: an HTTPS one on a plain ws:// host (e.g.
		// straight to the hosting's port, no Caddy) stalls the negotiation until it
		// times out, since there's no TLS handshake for it to take part in.
		// socket.io-client's type says string | boolean, but the underlying ws takes an Agent.
		const agent = (host.startsWith("wss://") ? serverHttpsAgent() : serverHttpAgent()) as unknown as boolean;

		this.socket = io(host, {
			transports: ["websocket"],
			path: "/io/ws",
			extraHeaders: { authorization: token },
			agent,
		});

		log.info(`Connecting to ${host}`);

		this.socket.on("connect", () => {
			log.success(`Connected to ${host}`);
		});

		this.socket.on("disconnect", (reason) => {
			log.warn(`Disconnected: ${reason}`);

			// `io server disconnect` = the hosting dropped us in handleConnection
			// (an invalid / expired token). socket.io doesn't reconnect on its own
			// then — the real reason is in the hosting's log: "Driver connection
			// rejected: <...>". Other reasons ("transport close" on a hosting
			// restart, etc.) reconnect on their own.
			if (reason === "io server disconnect") {
				log.error(
					"The hosting refused the connection: the driver's token expired or is invalid " +
					"(run 'hio driver login <pairToken> <name>' again), or the hosting's HIO_JWT_SECRET changed. " +
					"See 'Driver connection rejected:' in the hosting's log.",
				);
			}
		});

		// During a hosting restart this fires in bursts (ECONNREFUSED) until the
		// server is back — just the message, without the error's huge dump.
		this.socket.on("connect_error", (err) => {
			log.warn(`Can't reach the hosting: ${err.message}`);
		});

	}

	/** Closes the socket — it won't reconnect. */
	disconnect(): void {
		this.socket?.disconnect();
	}

	isConnected(): boolean {
		return this.socket?.connected ?? false;
	}

}
