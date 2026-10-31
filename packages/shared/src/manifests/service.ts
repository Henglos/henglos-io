import fs from "fs/promises";
import * as YAML from "yaml";
import { ManifestSchema } from "./schema.js";
import type { Manifest } from "./types.js";

/** Reads manifest.yaml files and validates them (ManifestSchema). */
export class ManifestService {

	async load(filePath: string): Promise<Manifest> {
		const raw = await fs.readFile(filePath, "utf-8");
		const parsed = YAML.parse(raw);
		return ManifestSchema.parse(parsed);
	}

	async loadAs<K extends Manifest["kind"]>(
		filePath: string,
		kind: K,
	): Promise<Extract<Manifest, { kind: K }>> {
		const manifest = await this.load(filePath);
		if (manifest.kind !== kind) {
			throw new Error(`Expected manifest kind "${kind}", got "${manifest.kind}" at: ${filePath}`);
		}
		return manifest as Extract<Manifest, { kind: K }>;
	}
}
