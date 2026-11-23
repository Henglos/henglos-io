import "reflect-metadata";      // the services are tsyringe @injectable()s
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { Server } from "socket.io";
import { io } from "socket.io-client";

import { SocketIOClient } from "../src/daemon/infrastructure/ws/SocketIOClient.impl.js";

// A hosting on the loopback: Socket.IO on /io/ws, namespace /driver — what the
// driver connects to. `onDriver` gets each driver's socket as it connects.
const hosting = async (onDriver: (socket: import("socket.io").Socket) => void) => {
	const http: HttpServer = createServer();
	const server = new Server(http, { path: "/io/ws" });
	server.of("/driver").on("connection", onDriver);
	await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
	const { port } = http.address() as AddressInfo;
	return { url: `ws://127.0.0.1:${port}/driver`, close: () => new Promise<void>(resolve => { server.close(); http.close(() => resolve()); }) };
};

// A record of 12 actions: a binary per frame — past socket.io-parser's default of 10.
const frames = Array.from({ length: 12 }, (_, i) => new Uint8Array([0x02, i, 0x03]));

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });

describe("SocketIOClient", () => {

	test("takes a message with more binary parts than socket.io-parser's default", async () => {
		const server = await hosting(socket => socket.emit("task:start", { taskId: "t1", type: "record", payload: { frames } }));
		cleanups.push(server.close);

		const client = new SocketIOClient();
		const received = new Promise<{ payload: { frames: Uint8Array[] } }>((resolve, reject) => {
			void client.connect(server.url, "token").then(() => {
				client.socket!.on("task:start", resolve);
				client.socket!.on("disconnect", reason => reject(new Error(`disconnected: ${reason}`)));
			});
		});
		cleanups.push(() => { client.socket?.disconnect(); });

		const start = await received;
		expect(start.payload.frames).toHaveLength(12);
		expect([...new Uint8Array(start.payload.frames[11]!)]).toEqual([0x02, 11, 0x03]);
	});

	test("(the default parser drops that connection: what it guards against)", async () => {
		const server = await hosting(socket => socket.emit("task:start", { payload: { frames } }));
		cleanups.push(server.close);

		const socket = io(server.url, { path: "/io/ws", transports: ["websocket"], reconnection: false });
		cleanups.push(() => { socket.disconnect(); });

		const reason = await new Promise<string>(resolve => socket.on("disconnect", resolve));
		expect(reason).toBe("parse error");
	});

});
