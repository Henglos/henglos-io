import "reflect-metadata";      // the services are tsyringe @injectable()s
import { afterEach, describe, expect, test, vi } from "vitest";

import { ExecuteSessionsService } from "../src/daemon/application/services/ExecuteSessions.service.js";
import { StartExecuteSessionUseCase } from "../src/daemon/application/use-cases/workflow/StartExecuteSession.use-case.js";
import { FinishExecuteSessionUseCase } from "../src/daemon/application/use-cases/workflow/FinishExecuteSession.use-case.js";
import { ReplSession } from "../src/daemon/application/services/ReplSession.service.js";
import type { BoardInstaller } from "../src/daemon/application/services/BoardInstaller.service.js";
import type { MpyCompiler } from "../src/daemon/application/services/MpyCompiler.service.js";
import type { SocketIOClient } from "../src/daemon/infrastructure/ws/SocketIOClient.impl.js";
import type { TaskContext } from "../src/daemon/domain/entities/TaskContext.js";
import type { BoardInstall } from "@henglosio/shared";

const tick = () => new Promise(resolve => setTimeout(resolve, 20));

// A board whose install runs until its REPL is closed — like a big one still uploading.
const setup = () => {
	let failInstall: (err: Error) => void = () => {};
	const repl = { close: vi.fn(async () => { failInstall(new Error("port closed")); }), exchange: vi.fn() };
	vi.spyOn(ReplSession, "open").mockResolvedValue(repl as unknown as ReplSession);
	const installer = { sync: () => new Promise((_resolve, reject) => { failInstall = reject; }) } as unknown as BoardInstaller;
	const ws = { socket: { emit: () => {} } } as unknown as SocketIOClient;
	const ctx = { taskId: "t1", signal: new AbortController().signal, info: () => {} } as unknown as TaskContext;
	const sessions = new ExecuteSessionsService(ws);
	const compiler = { forWorkflow: () => ({ compile: async () => ({ version: 6, mpy: new Map() }) }) } as unknown as MpyCompiler;
	return { repl, ctx, start: new StartExecuteSessionUseCase(sessions, installer, compiler), finish: new FinishExecuteSessionUseCase(sessions) };
};

afterEach(() => { vi.restoreAllMocks(); });

describe("the execute session", () => {

	test("a finish while installing ends the session — it doesn't hold the port forever", async () => {
		const { repl, ctx, start, finish } = setup();
		const started = start.execute("t1", "wf1", "COM4", 115200, new Uint8Array(), ctx, { components: [], files: [] } as BoardInstall);
		await tick();

		await finish.execute("t1");

		await expect(started).rejects.toThrow(/cancelled/);
		expect(repl.close).toHaveBeenCalled();
		expect(repl.exchange).not.toHaveBeenCalled();
	});

});
