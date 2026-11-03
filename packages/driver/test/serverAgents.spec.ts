import "reflect-metadata";      // the services are tsyringe @injectable()s
import http from "http";
import type { AddressInfo } from "net";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { serverHttpAgent } from "../src/daemon/infrastructure/ws/serverAgents.js";
import { SocketIOClient } from "../src/daemon/infrastructure/ws/SocketIOClient.impl.js";

let server: http.Server;
let port: number;

beforeEach(async () => {
	server = http.createServer((req, res) => res.end(req.headers.host));
	await new Promise<void>(resolve => server.listen(0, "localhost", resolve));
	port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
	server.closeAllConnections();
	await new Promise(resolve => server.close(resolve));
});

describe("a server at *.localhost", () => {

	test("is reached over HTTP, keeping its name in the Host header", async () => {
		const { data } = await axios.get(`http://hio.localhost:${port}/`, { httpAgent: serverHttpAgent() });
		expect(data).toBe(`hio.localhost:${port}`);
	});

	test("is reached by the socket", async () => {
		const upgraded = new Promise<string | undefined>(resolve => {
			server.on("upgrade", (req, socket) => {
				socket.destroy();
				resolve(req.headers.host);
			});
		});

		const client = new SocketIOClient();
		await client.connect(`ws://hio.localhost:${port}`, "token");

		expect(await upgraded).toBe(`hio.localhost:${port}`);
		client.disconnect();
	});

});
