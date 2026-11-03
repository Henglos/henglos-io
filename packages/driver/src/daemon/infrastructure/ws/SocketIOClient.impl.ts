import { io, Socket } from "socket.io-client";
import { injectable } from "tsyringe";
import { serverHttpAgent, serverHttpsAgent } from "./serverAgents.js";

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

		this.socket.on("connect", () => {
			console.log("Connected");
		});

		this.socket.on("disconnect", (reason) => {
			console.log(`Disconnected: ${reason}`);

			// `io server disconnect` = the hosting dropped us in handleConnection
			// (an invalid / expired token). socket.io doesn't reconnect on its own
			// then — the real reason is in the hosting's log: "Driver connection
			// rejected: <...>". Other reasons ("transport close" on a hosting
			// restart, etc.) reconnect on their own.
			if (reason === "io server disconnect") {
				console.error(
					"[ws] O servidor recusou a conexão. Causas comuns: token do driver expirado/invalido " +
					"(rode 'hio driver login <pairToken> <name>' de novo) ou HIO_JWT_SECRET do hosting mudou. " +
					"Veja 'Driver connection rejected:' no log do hosting.",
				);
			}
		});

		// During a hosting restart this fires in bursts (ECONNREFUSED) until the
		// server is back — just the message, without the error's huge dump.
		this.socket.on("connect_error", (err) => {
			console.error(`Connection error: ${err.message}`);
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
