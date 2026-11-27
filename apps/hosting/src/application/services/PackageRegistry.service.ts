import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegistryDownloadFailed, RegistryPackageNotFound } from '@/application/errors/services/Registry.error';
import semver from 'semver';
import {
	ManifestNotFound,
	InvalidPackageSchema,
	InvalidPackageType,
} from '@/application/errors/services/Package.error';
import pacote from "pacote";
import { Parser as TarParser } from "tar";
import path from "path";
import * as YAML from "yaml";
import { BoardSchema, ComponentSchema } from '@henglosio/workflow';
import { ManifestSchema } from '@henglosio/shared';
import type { Env } from '@/config/env.schema';
import { Package } from '@/domain/entities/Package';
import { LocalPackagesService, type LocalPackage } from './LocalPackages.service';

// The package's YAML files, wherever they are: manifest.yaml at its root, and a
// board's schema in the folder its manifest names — the only files metadata
// needs, as opposed to the sources and builds, which can hold arbitrarily large
// (and irrelevant, for metadata purposes) content.
const METADATA_YAML_PATTERN = /^(?!(?:.*\/)?node_modules\/).*\.ya?ml$/;
const MANIFEST_FILE = 'manifest.yaml';

/**
 * Reads board and component packages from npm registries. npm, Gitea and
 * GitHub Packages speak the same registry HTTP API (metadata + tarball) — all
 * that changes between them is the base URL and an optional token, so there's
 * no class per provider: it's always the same request, to another place.
 *
 * Every method takes the registry (HIO_REGISTRY_URL by default) and the token
 * for a private package. On the default registry, the packages that come with
 * the hosting (see LocalPackagesService) take precedence: a package another
 * registry was asked for, or that isn't among them, is read from the registry.
 */
@Injectable()
export class PackageRegistryService {

	constructor(
		private readonly config: ConfigService<Env, true>,
		private readonly localPackages: LocalPackagesService,
	) {}

	private get defaultRegistryUrl(): string {
		return this.config.get('HIO_REGISTRY_URL', { infer: true });
	}

	/** The registry to use: the one given, or HIO_REGISTRY_URL. */
	resolveRegistryUrl(registryUrl?: string): string {
		return registryUrl ?? this.defaultRegistryUrl;
	}

	private findLocal(spec: string, registryUrl: string): Promise<LocalPackage | null> {
		return registryUrl === this.defaultRegistryUrl ? this.localPackages.find(spec) : Promise.resolve(null);
	}

	/**
	 * Every published version of `name`, and the one that comes with the hosting.
	 *
	 * @throws RegistryDownloadFailed when the registry doesn't answer with it
	 *   and the hosting doesn't have it.
	 */
	async listVersions(name: string, registryUrl = this.defaultRegistryUrl, token?: string): Promise<string[]> {
		const local = await this.findLocal(name, registryUrl);
		const headers = this.buildHeaders(token);
		const res = await fetch(`${registryUrl}/${encodeURIComponent(name)}`, { headers }).catch(() => null);
		if (!res?.ok) {
			if (local) return [local.version];
			throw new RegistryDownloadFailed();
		}

		const meta = await res.json() as { versions?: Record<string, unknown> };
		const versions = Object.keys(meta.versions ?? {});
		return local && !versions.includes(local.version) ? [...versions, local.version] : versions;
	}

	/**
	 * `name`'s page on the registry (its packument, via pacote — no tarball):
	 * every published version, newest first, the "latest" dist-tag, and when
	 * each was published. Throws RegistryPackageNotFound when there's no such
	 * package. The version that comes with the hosting counts as one of them.
	 */
	async describePackage(name: string, registryUrl = this.defaultRegistryUrl, token?: string): Promise<{
		name: string;
		description: string;
		latest: string | null;
		versions: { version: string; publishedAt: string | null; deprecated: string | null }[];
	}> {
		// fullMetadata: the publish times and each version's deprecation, not just the corgi doc.
		const load = () => pacote.packument(name, { registry: registryUrl, token, fullMetadata: true });
		const local = await this.findLocal(name, registryUrl);
		const localVersion = local && { version: local.version, publishedAt: null, deprecated: null };
		let packument: Awaited<ReturnType<typeof load>>;
		try {
			packument = await load();
		} catch (error) {
			if (local) return { name: local.name, description: local.description, latest: local.version, versions: [localVersion!] };
			const code = (error as { code?: string; statusCode?: number })?.code;
			if (code === 'E404' || (error as { statusCode?: number })?.statusCode === 404) throw new RegistryPackageNotFound(name);
			throw new RegistryDownloadFailed();
		}

		const time = (packument.time ?? {}) as Record<string, string>;
		const versions: { version: string; publishedAt: string | null; deprecated: string | null }[] = Object.entries(packument.versions ?? {})
			.filter(([version]) => semver.valid(version))
			.map(([version, manifest]) => {
				const deprecated: unknown = (manifest as { deprecated?: unknown }).deprecated;
				return { version, publishedAt: time[version] ?? null, deprecated: typeof deprecated === 'string' ? deprecated : null };
			});
		if (localVersion && !versions.some(({ version }) => version === localVersion.version)) versions.push(localVersion);
		versions.sort((a, b) => semver.rcompare(a.version, b.version));

		const latest = packument['dist-tags']?.latest ?? versions[0]?.version ?? null;
		const description = (latest && (packument.versions?.[latest] as { description?: string } | undefined)?.description)
			?? (packument as { description?: string }).description
			?? '';

		return { name: packument.name, description, latest, versions };
	}

	/**
	 * Reads a package version — from the hosting's own, or from its registry —
	 * and validates it: what it takes to install one. Only its package.json and
	 * its YAML files are read (see streamMetadataFiles), never the whole tarball.
	 *
	 * @param spec An npm spec: `name@version`, or a name for the latest.
	 * @returns The package, not saved yet.
	 * @throws ManifestNotFound, InvalidPackageType (not a board or a component),
	 *   InvalidPackageSchema, or RegistryDownloadFailed.
	 */
	async fetchPackage(spec: string, registryUrl = this.defaultRegistryUrl, token?: string): Promise<Package> {
		const local = await this.findLocal(spec, registryUrl);
		const files = local
			? await this.localPackages.readFiles(local.dir, this.isMetadataFile)
			: await this.streamMetadataFiles(spec, registryUrl, token);

		const pkgJsonRaw = files.get('package.json');
		if (!pkgJsonRaw) throw new ManifestNotFound();
		const pkgJson = JSON.parse(pkgJsonRaw) as {
			name: string;
			version: string;
			author?: string | { name: string };
			description?: string;
		};

		const manifestRaw = files.get(MANIFEST_FILE);
		if (!manifestRaw) throw new ManifestNotFound();

		const manifest = ManifestSchema.parse(YAML.parse(manifestRaw));
		if (manifest.kind !== 'board' && manifest.kind !== 'component') {
			throw new InvalidPackageType();
		}

		// Board still ships its schema as a separate <name>.schema.yaml next to
		// its manifest, pointed to by ui.schema; component inlines it under
		// manifest.schema (single-file component packages).
		let schemaData: unknown;
		if (manifest.kind === 'board') {
			const schemaRaw = files.get(path.posix.normalize(manifest.ui.schema));
			if (!schemaRaw) throw new InvalidPackageSchema();
			try {
				schemaData = YAML.parse(schemaRaw);
			} catch {
				throw new InvalidPackageSchema();
			}
		} else {
			schemaData = manifest.schema;
		}

		// Capabilities sit in the manifest (a board's `capabilities`, a
		// component's dependences.capabilities) — the schema is what the
		// workflow keeps, so they go into it.
		const capabilities = manifest.kind === 'board' ? manifest.capabilities : manifest.dependences.capabilities;
		if (capabilities && schemaData && typeof schemaData === 'object') {
			schemaData = { ...(schemaData as Record<string, unknown>), capabilities };
		}
		if (manifest.kind === 'board' && manifest.options && schemaData && typeof schemaData === 'object') {
			schemaData = { ...(schemaData as Record<string, unknown>), options: manifest.options };
		}
		if (manifest.kind === 'board' && schemaData && typeof schemaData === 'object') {
			schemaData = { ...(schemaData as Record<string, unknown>), flashMethods: manifest.firmware.methods };
		}

		const parsed = manifest.kind === 'board'
			? BoardSchema.safeParse(schemaData)
			: ComponentSchema.safeParse(schemaData);

		if (!parsed.success) throw new InvalidPackageSchema();

		return Package.create({
			name: manifest.name,
			spec: pkgJson.name,
			version: pkgJson.version,
			author: typeof pkgJson.author === 'object' ? pkgJson.author.name : (pkgJson.author ?? ''),
			description: pkgJson.description ?? '',
			type: manifest.kind,
			schema: parsed.data,
			registry: registryUrl,
			platform: manifest.dependences.platform,
		});
	}

	/**
	 * Reads only the package.json and the *.yaml files, straight from the tarball's stream, never extracting the
	 * package to disk — src/, build/ and any other large file are drained by
	 * the tar.Parser itself (via `filter`) and never buffered.
	 *
	 * @returns Their contents, by path relative to the package's root.
	 */
	private streamMetadataFiles(spec: string, registryUrl: string, token?: string): Promise<Map<string, string>> {
		const files = new Map<string, string>();

		const run = pacote.tarball.stream(spec, (stream) => new Promise<void>((resolve, reject) => {
			const parser = new TarParser({
				filter: (entryPath) => this.isMetadataFile(this.stripPackageRoot(entryPath)),
			});

			parser.on('entry', (entry) => {
				const relativePath = this.stripPackageRoot(entry.path);
				const chunks: Buffer[] = [];
				entry.on('data', (chunk: Buffer) => chunks.push(chunk));
				entry.on('end', () => files.set(relativePath, Buffer.concat(chunks).toString('utf-8')));
			});

			parser.on('error', reject);
			parser.on('end', () => resolve());

			stream.on('error', reject);
			stream.pipe(parser);
		}), { registry: registryUrl, token });

		return run.then(() => files).catch((e) => {
			console.log(e)
			throw new RegistryDownloadFailed();

		 });
	}

	private isMetadataFile(relativePath: string): boolean {
		return relativePath === 'package.json' || METADATA_YAML_PATTERN.test(relativePath);
	}

	// npm tarballs always nest content under a single top-level "package/" dir.
	private stripPackageRoot(entryPath: string): string {
		return entryPath.split('/').slice(1).join('/');
	}

	private buildHeaders(token?: string): Record<string, string> {
		return token ? { Authorization: `Bearer ${token}` } : {};
	}

}
