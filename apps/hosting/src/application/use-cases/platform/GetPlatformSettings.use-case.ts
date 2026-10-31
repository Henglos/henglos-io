import { gunzipSync } from "node:zlib";
import { Injectable } from "@nestjs/common";
import * as YAML from "yaml";
import { PlatformRuleSchema, PlatformSettingSchema, type PlatformRule, type PlatformSetting } from "@henglosio/shared";

/** What a workflow can override of a platform version, and the rules between those values. */
export type PlatformSettingsOut = { settings: PlatformSetting[]; rules: PlatformRule[] };
import { PlatformService } from "@/application/services/Platform.service";
import { PlatformNotFound } from "@/application/errors/services/Platform.error";

/** One file of an npm tarball (.tgz) — ustar headers, 512-byte blocks. */
function readTarEntry(tgz: Buffer, wanted: string): string | null {
	const tar = gunzipSync(tgz);
	const text = (start: number, length: number) => tar.toString("utf-8", start, start + length).replace(/\0.*$/s, "");

	for (let offset = 0; offset + 512 <= tar.length;) {
		const name = text(offset, 100);
		if (!name) return null;                                // two zero blocks end the archive
		const prefix = text(offset + 345, 155);
		const size = parseInt(text(offset + 124, 12).trim() || "0", 8);
		const body = offset + 512;
		if ((prefix ? `${prefix}/${name}` : name) === wanted) return tar.toString("utf-8", body, body + size);
		offset = body + Math.ceil(size / 512) * 512;
	}
	return null;
}

/**
 * The runtime limits a platform version lets a workflow override — its
 * manifest.yaml's `settings`, read from the published package. Versions are
 * immutable once published, so each is read once.
 */
@Injectable()
export class GetPlatformSettingsUseCase {

	private readonly cache = new Map<string, PlatformSettingsOut>();

	// Through PlatformService, like every other use-case: the repository token
	// stays inside PlatformModule.
	constructor(private readonly platformService: PlatformService) {}

	/** @throws PlatformNotFound when there's no such version. */
	async execute(version: string): Promise<PlatformSettingsOut> {

		const cached = this.cache.get(version);
		if (cached) return cached;

		if (!(await this.platformService.list()).includes(version)) throw new PlatformNotFound(version);

		const manifest = readTarEntry(await this.platformService.fetch(version), "package/manifest.yaml");
		const parsed = manifest ? YAML.parse(manifest) as { settings?: unknown; rules?: unknown } : {};
		// A version from before settings existed has none — nothing to override.
		const out: PlatformSettingsOut = {
			settings: PlatformSettingSchema.array().parse(parsed.settings ?? []),
			rules: PlatformRuleSchema.array().parse(parsed.rules ?? []),
		};

		this.cache.set(version, out);
		return out;

	}

}
