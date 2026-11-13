import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import type { Env } from '@/config/env.schema';

/** A board or component package found in HIO_LOCAL_PACKAGES. */
export type LocalPackage = {
	name: string;
	version: string;
	description: string;
	/** Its folder. */
	dir: string;
};

// The monorepo's layout, under HIO_LOCAL_PACKAGES.
const PACKAGE_KINDS = ['library/boards', 'library/components'];

/**
 * The boards and components that come with the hosting, read from a folder
 * (HIO_LOCAL_PACKAGES) instead of a registry. With it unset, there are none.
 */
@Injectable()
export class LocalPackagesService {

	constructor(private readonly config: ConfigService<Env, true>) {}

	/**
	 * The package `spec` asks for: `name`, `name@latest`, or `name@<range>`
	 * when the local version satisfies it. Null otherwise — the registry's turn.
	 */
	async find(spec: string): Promise<LocalPackage | null> {
		const at = spec.lastIndexOf('@');
		const name = at > 0 ? spec.slice(0, at) : spec;
		const wanted = at > 0 ? spec.slice(at + 1) : 'latest';

		const found = (await this.list()).find(pkg => pkg.name === name);
		if (!found) return null;
		return wanted === 'latest' || semver.satisfies(found.version, wanted) ? found : null;
	}

	/** Reads the files of `dir`, in any folder, whose path (relative to it) `wanted` accepts. */
	async readFiles(dir: string, wanted: (relativePath: string) => boolean): Promise<Map<string, string>> {
		const files = new Map<string, string>();

		for (const entry of await fs.readdir(dir, { recursive: true })) {
			const relativePath = entry.replaceAll(path.sep, '/');
			if (wanted(relativePath)) files.set(relativePath, await fs.readFile(path.join(dir, entry), 'utf-8'));
		}

		return files;
	}

	private async list(): Promise<LocalPackage[]> {
		const root = this.config.get('HIO_LOCAL_PACKAGES', { infer: true });
		if (!root) return [];

		const packages: LocalPackage[] = [];
		for (const kind of PACKAGE_KINDS) {
			const entries = await fs.readdir(path.resolve(root, kind)).catch(() => [] as string[]);
			for (const entry of entries) {
				const dir = path.resolve(root, kind, entry);
				const pkgJson = await fs.readFile(path.join(dir, 'package.json'), 'utf-8').catch(() => null);
				if (!pkgJson) continue;
				const { name, version, description } = JSON.parse(pkgJson) as { name: string; version: string; description?: string };
				packages.push({ name, version, description: description ?? '', dir });
			}
		}
		return packages;
	}

}
