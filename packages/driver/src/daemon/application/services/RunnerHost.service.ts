import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { inject, injectable } from "tsyringe";
import { IContainerRuntime } from "../../domain/interfaces/IContainerRuntime.interface.js";

// Where the runner host goes in the build container, next to runner.map.json.
const CONTAINER_PATH = "/workspace/runner-host.mjs";

/**
 * The platform's Runner, run in a board's image by this driver's own runner host
 * — dist/runner-host.mjs of the `hio` this driver ships in (apps/cli's
 * src/runner-host.ts): one self-contained file, copied into the container before
 * each run. So an image needs Node and its board's tools, not `hio`, and what
 * runs inside always speaks this driver's protocol.
 *
 * HIO_RUNNER_HOST points at another build of it (a driver run from its sources).
 * Without one — an older `hio` — the image's own `hio` runs, as before.
 */
@injectable()
export class RunnerHost {

	private cached: Buffer | null | undefined;

	constructor(
		@inject("IContainerRuntime") private readonly containerService: IContainerRuntime,
	) {}

	/**
	 * The command that runs `args` (`build …` / `flash …`, relative to /workspace)
	 * in `containerName` — the runner host copied in first, or the image's `hio`.
	 */
	async command(containerName: string, args: string[]): Promise<string[]> {
		const host = await this.read();
		if (!host) return ["npx", "hio", ...args];
		await this.containerService.copyToContainer(containerName, CONTAINER_PATH, host);
		return ["node", CONTAINER_PATH, ...args];
	}

	// The runner host's bytes, read once — null when there's none to inject.
	private async read(): Promise<Buffer | null> {
		if (this.cached !== undefined) return this.cached;
		const candidates = [
			process.env["HIO_RUNNER_HOST"],
			// In the `hio` bundle, this code sits in dist/ next to runner-host.mjs.
			path.join(path.dirname(fileURLToPath(import.meta.url)), "runner-host.mjs"),
		].filter((candidate): candidate is string => !!candidate);
		for (const candidate of candidates) {
			const data = await fs.readFile(candidate).catch(() => null);
			if (data) return this.cached = data;
		}
		return this.cached = null;
	}

}
