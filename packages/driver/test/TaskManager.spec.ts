import "reflect-metadata";      // the services are tsyringe @injectable()s
import { describe, expect, test } from "vitest";

import { TaskManager } from "../src/daemon/application/services/TaskManager.service.js";
import { LockManager } from "../src/daemon/application/services/LockManager.service.js";
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

	// A task on a port that ignores its cancel, and only ends when told to.
	const stuck = (port: string) => {
		let end: (value?: unknown) => void = () => {};
		const command: ITaskCommand<null> = {
			type: "flash",
			isValidPayload: (_p: unknown): _p is null => true,
			locks: () => [`port:${port}`],
			execute: () => new Promise(resolve => { end = resolve; }),
		};
		return { command, end: () => end() };
	};

	test("a task that ignores its cancel is ended anyway, and the port is free", async () => {
		const { events, tasks } = setup();
		tasks.cancelGraceMs = 10;
		const { command, end } = stuck("COM3");
		tasks.run("a", command, null);
		await tick();

		tasks.cancel("a");
		await tick();

		expect(tasks.onPort("COM3")).toEqual([]);
		expect(tasks.isRunning("a")).toBe(false);
		expect(events.find(e => e.taskId === "a" && e.kind === "result")?.error).toMatch(/cancel_forced/);

		// If it finally ends, that's not reported on top.
		const before = events.length;
		end();
		await tick();
		expect(events.length).toBe(before);
	});

	test("a task that stops by itself doesn't get forced afterwards", async () => {
		const { events, tasks } = setup();
		tasks.cancelGraceMs = 10;
		tasks.run("a", onPort("COM3"), null);
		await tick();
		tasks.cancel("a");
		await tick();

		expect(events.filter(e => e.taskId === "a" && e.kind === "result")).toHaveLength(1);
		expect(events.find(e => e.taskId === "a" && e.kind === "result")?.error).toBe("aborted");
	});

	test("releasePort: cancels what holds the port, and says what it was", async () => {
		const { tasks } = setup();
		tasks.run("a", onPort("COM3"), null);
		tasks.run("b", onPort("COM4"), null);
		await tick();

		expect(tasks.releasePort("COM3").map(task => task.taskId)).toEqual(["a"]);
		await tick();

		expect(tasks.onPort("COM3")).toEqual([]);
		expect(tasks.onPort("COM4")).toHaveLength(1);
		expect(tasks.releasePort("COM9")).toEqual([]);
	});

	test("state: what's running, with what its payload says, and how the latest tasks ended", async () => {
		const { tasks } = setup();
		const payload = { workflowId: "wf", port: "COM3" } as unknown as null;
		tasks.run("a", onPort("COM3"), payload);
		await tick();

		expect(tasks.state()).toEqual({
			running: [{ taskId: "a", type: "execute", workflowId: "wf", port: "COM3", startedAt: expect.any(Number) }],
			finished: [],
		});

		tasks.cancel("a");
		await tick();
		expect(tasks.state()).toEqual({ running: [], finished: [{ taskId: "a", ok: false, error: "aborted" }] });
	});

	test("reject: a task that can't start is answered, not left waiting", async () => {
		const { events, tasks } = setup();
		tasks.reject("a", "invalid_payload: flash");

		expect(events.find(e => e.kind === "result")).toMatchObject({ taskId: "a", ok: false, error: "invalid_payload: flash" });
		expect(events.find(e => e.kind === "status")?.status).toBe("failed");
		expect(tasks.state().finished).toEqual([{ taskId: "a", ok: false, error: "invalid_payload: flash" }]);
	});

});
