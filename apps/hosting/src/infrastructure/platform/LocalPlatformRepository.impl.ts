import fs from "node:fs/promises";
import path from "node:path";
import { create as createTar } from "tar";
import type { IPlatformRepository } from "@/domain/repositories/IPlatformRepository.repo";

/**
 * The platform release in a folder, on top of the ones `fallback` offers: its
 * version is served from there, every other from `fallback`.
 */
export class LocalPlatformRepository implements IPlatformRepository {

	constructor(
		private readonly dir: string,
		private readonly fallback: IPlatformRepository,
	) {}

	async list(): Promise<string[]> {
		const local = await this.localVersion();
		const versions = await this.fallback.list();
		return local && !versions.includes(local) ? [...versions, local] : versions;
	}

	async fetch(version: string): Promise<Buffer> {
		if (version !== await this.localVersion()) return this.fallback.fetch(version);

		// What the hosting reads of a release — laid out like a registry's tarball.
		const chunks: Buffer[] = [];
		const tar = createTar({ gzip: true, portable: true, cwd: this.dir, prefix: "package" }, ["package.json", "manifest.yaml"]);
		for await (const chunk of tar) chunks.push(Buffer.from(chunk as Uint8Array));
		return Buffer.concat(chunks);
	}

	private async localVersion(): Promise<string | null> {
		const pkgJson = await fs.readFile(path.join(this.dir, "package.json"), "utf-8").catch(() => null);
		return pkgJson ? (JSON.parse(pkgJson) as { version: string }).version : null;
	}
}
