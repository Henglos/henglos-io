import "reflect-metadata";      // the services are tsyringe @injectable()s
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { RunnerProtocol } from "@henglosio/runner";

import { ContainerTunnel } from "../src/daemon/application/services/ContainerTunnel.service.js";

// The tunnel on the loopback — what Docker Desktop forwards host.docker.internal to.
const tunnel = new ContainerTunnel();
beforeAll(() => tunnel.initialize("127.0.0.1"));
afterAll(() => tunnel.shutdown());

const post = (url: string, token?: string) => fetch(url.replace("host.docker.internal", "127.0.0.1"), {
	method: "POST",
	headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
	body: JSON.stringify({ type: "data", data: "hello" } satisfies RunnerProtocol),
});

describe("ContainerTunnel", () => {

	test("hands a message with the session's token to its handler", async () => {
		const received: RunnerProtocol[] = [];
		const { url, token } = tunnel.createSession("task-1", payload => received.push(payload));

		expect((await post(url, token)).status).toBe(200);
		expect(received).toEqual([{ type: "data", data: "hello" }]);
		tunnel.destroySession("task-1");
	});

	test("refuses a message without the token, or with another session's", async () => {
		const received: RunnerProtocol[] = [];
		const { url } = tunnel.createSession("task-2", payload => received.push(payload));
		const other = tunnel.createSession("task-3", () => {});

		expect((await post(url)).status).toBe(401);
		expect((await post(url, other.token)).status).toBe(401);
		expect((await post(url, "not-a-token")).status).toBe(401);
		expect(received).toEqual([]);
		tunnel.destroySession("task-2");
		tunnel.destroySession("task-3");
	});

	test("a session ended takes no more messages", async () => {
		const { url, token } = tunnel.createSession("task-4", () => {});
		tunnel.destroySession("task-4");

		expect((await post(url, token)).status).toBe(404);
	});

	test("has no /serial-control any more", async () => {
		const response = await fetch("http://127.0.0.1:5758/serial-control", { method: "POST", body: "{}" });
		expect(response.status).toBe(404);
	});

});
