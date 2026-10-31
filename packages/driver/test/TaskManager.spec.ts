import "reflect-metadata";      // the services are tsyringe @injectable()s
import { describe, expect, test } from "vitest";

import { TaskManager } from "../src/daemon/application/services/TaskManager.js";
import { LockManager } from "../src/daemon/application/services/LockManager.js";
import type { SocketIOClient } from "../src/daemon/infrastructure/ws/SocketIOClient.impl.js";
import type { ITaskCommand } from "../src/daemon/domain/interfaces/ICommand.interface.js";

type Event = { taskId: string; kind: string; status?: string; ok?: boolean; error?: string };

// The task events the driver would send hosting.
const setup = () => {
	const events: Event[] = [];
	const ws = { socket: { emit: (_name: string, event: Event) => events.push(event) } } as unknown as SocketIOClient;
	return { events, tasks: new TaskManager(ws, new LockManager()) };
};

// A task on a port that runs until it's cancelled.
const onPort = (port: string): ITaskCommand<null> => ({
	type: "execute",
	isValidPayload: (_p: unknown): _p is null => true,
	locks: () => [`port:${port}`],
	execute: (_payload, ctx) => new Promise((_resolve, reject) => {
		ctx.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
	}),
});

const tick = () => new Promise(resolve => setTimeout(resolve, 20));

describe("TaskManager", () => {

	test("onPort: the task holding the port, nothing on another", async () => {
		const { tasks } = setup();
		tasks.run("a", onPort("COM3"), null);
		await tick();

		expect(tasks.onPort("COM3")).toEqual([{ taskId: "a", type: "execute", startedAt: expect.any(Number) }]);
		expect(tasks.onPort("COM4")).toEqual([]);
	});

	test("a second task on a busy port fails busy; once the first is cancelled the port is free", async () => {
		const { events, tasks } = setup();
		tasks.run("a", onPort("COM3"), null);
		await tick();
		tasks.run("b", onPort("COM3"), null);
		await tick();
		expect(events.find(e => e.taskId === "b" && e.kind === "result")?.error).toMatch(/busy/);

		tasks.cancel("a");
		await tick();
		expect(tasks.onPort("COM3")).toEqual([]);
		expect(events.filter(e => e.taskId === "a" && e.kind === "status").map(e => e.status)).toContain("cancelled");
	});

});
