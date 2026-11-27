import { createHash } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { inject, injectable } from "tsyringe";
import { BUILD_INFO, type BuildInfo, type CompileRequest, type CompileResult } from "@henglosio/runner";
import { IContainerRuntime } from "../../domain/interfaces/IContainerRuntime.interface.js";
import { RunnerHost } from "./RunnerHost.service.js";
import { WorkflowService } from "./WorkflowService.service.js";

// Compiles what a session installs on the board (see BoardInstaller) to .mpy
// with the board's own mpy-cross — the one its firmware script's prepare
// returned, so the bytecode always matches its MicroPython (a fork's too). It
// lives in the board's image, so it runs in the workflow's build container
// (`hio compile`), and only for what isn't cached here yet: the cache is keyed
// by that mpy-cross (the build's BUILD_INFO says which), so a Play with nothing
// new starts no container.

const CONTAINER_INPUT = "/workspace/compile-request.json";
const CONTAINER_OUTPUT = "/workspace/compile-result.json";

/** A module to compile. `name`: the path tracebacks on the board show (components/display/print.py). */
export type MpyModule = { name: string; source: string };

/** Compiled modules, by name, and the .mpy version they're for (their header's). */
export type MpyCompiled = { version: number; mpy: Map<string, Uint8Array> };

/** What BoardInstaller compiles with — MpyCompiler for a workflow, or a fake in tests. */
export interface ModuleCompiler {
	compile(modules: MpyModule[]): Promise<MpyCompiled>;
}

/** A component's script didn't compile — the message has mpy-cross's errors. */
export class MpyCompileError extends Error {}

/** There's no board's mpy-cross to compile with: the workflow wasn't compiled (yet) on this driver. */
export class MpyCompilerUnavailable extends Error {}

/**
 * Compiles MicroPython modules to .mpy with the board's mpy-cross, in the
 * workflow's build container — cached by content in ~/.henglos/io/driver/mpy-cache.
 */
@injectable()
export class MpyCompiler {

	private readonly cacheDir = path.join(os.homedir(), ".henglos", "io", "driver", "mpy-cache");
	// One `hio compile` at a time per workflow: they share the container's files.
	private readonly running = new Map<string, Promise<unknown>>();

	constructor(
		@inject("IContainerRuntime") private readonly containers: IContainerRuntime,
		private readonly runnerHost: RunnerHost,
		private readonly workflows: WorkflowService,
	) {}

	/** A compiler bound to `workflowId`'s board. */
	forWorkflow(workflowId: string): ModuleCompiler {
		return { compile: (modules) => this.compile(workflowId, modules) };
	}

	/**
	 * `modules` as .mpy. Throws MpyCompileError with mpy-cross's message (a
	 * syntax error), MpyCompilerUnavailable when the workflow wasn't compiled.
	 */
	async compile(workflowId: string, modules: MpyModule[]): Promise<MpyCompiled> {

		const info = await this.buildInfo(workflowId);
		const mpy = new Map<string, Uint8Array>();
		const missing: MpyModule[] = [];

		for (const module of modules) {
			const hit = await fs.readFile(this.cached(info.mpyCross, module)).catch(() => null);
			if (hit) mpy.set(module.name, new Uint8Array(hit));
			else missing.push(module);
		}

		if (missing.length > 0) {
			for (const [name, data] of await this.serialized(workflowId, () => this.inContainer(workflowId, missing))) {
				mpy.set(name, data);
			}
		}

		const first = mpy.values().next().value;
		return { version: first?.[1] ?? 0, mpy };

	}

	// Which mpy-cross the workflow's build was made with — none: not compiled here.
	private async buildInfo(workflowId: string): Promise<BuildInfo> {
		const file = path.join(this.workflows.buildPath(workflowId), BUILD_INFO);
		const info = await fs.readFile(file, "utf-8").then(text => JSON.parse(text) as Partial<BuildInfo>, () => null);
		if (!info?.mpyCross) throw new MpyCompilerUnavailable("The workflow isn't compiled on this driver — its components are compiled with the board's mpy-cross, which a compile prepares.");
		return info as BuildInfo;
	}

	private cached(mpyCross: string, module: MpyModule): string {
		const key = createHash("sha256").update(`${mpyCross}\0${module.name}\0${module.source}`).digest("hex");
		return path.join(this.cacheDir, `${key}.mpy`);
	}

	private async serialized<T>(workflowId: string, fn: () => Promise<T>): Promise<T> {
		const before = this.running.get(workflowId) ?? Promise.resolve();
		const next = before.catch(() => {}).then(fn);
		this.running.set(workflowId, next);
		try {
			return await next;
		} finally {
			if (this.running.get(workflowId) === next) this.running.delete(workflowId);
		}
	}

	// `hio compile` in the workflow's build container, and what it compiled cached here.
	private async inContainer(workflowId: string, modules: MpyModule[]): Promise<Map<string, Uint8Array>> {

		const containerName = `henglosio-${workflowId}`;
		if (!await this.containers.containerExists(containerName)) {
			throw new MpyCompilerUnavailable("The workflow's build container isn't on this driver — compile the workflow again.");
		}

		const request: CompileRequest = { modules };
		await this.containers.startContainer(containerName);
		let result: CompileResult;
		try {
			await this.containers.copyToContainer(containerName, CONTAINER_INPUT, Buffer.from(JSON.stringify(request)));
			const command = await this.runnerHost.command(containerName, [
				"compile", "--map", "runner.map.json", "--input", CONTAINER_INPUT, "--output", CONTAINER_OUTPUT, ".",
			]);
			const exec = await this.containers.execCommand(containerName, command, { workingDir: "/workspace" });
			if (exec.exitCode !== 0) {
				throw new Error(`Compiling with the board's mpy-cross failed (exit code ${exec.exitCode}): ${(exec.stderr || exec.stdout).trim()}`);
			}
			result = JSON.parse((await this.containers.copyFromContainer(containerName, CONTAINER_OUTPUT)).toString("utf-8")) as CompileResult;
		} finally {
			await this.containers.stopContainer(containerName).catch(() => {});
		}

		const errors = Object.values(result.errors);
		if (errors.length > 0) throw new MpyCompileError(errors.join("\n"));

		await fs.mkdir(this.cacheDir, { recursive: true });
		const compiled = new Map<string, Uint8Array>();
		for (const module of modules) {
			const encoded = result.mpy[module.name];
			if (encoded === undefined) throw new MpyCompileError(`${module.name}: hio compile left no .mpy for it.`);
			const data = new Uint8Array(Buffer.from(encoded, "base64"));
			compiled.set(module.name, data);
			// Keyed by the mpy-cross that compiled it — a newer prepare's, should it differ from the build's.
			await fs.writeFile(this.cached(result.mpyCross, module), data).catch(() => {});
		}
		return compiled;

	}

}
