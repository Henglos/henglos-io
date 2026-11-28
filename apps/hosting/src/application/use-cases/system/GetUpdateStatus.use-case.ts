import semver from "semver";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HENGLOSIO_REPOSITORY, type UpdateStatusOut } from "@henglosio/shared";
import type { Env } from "@/config/env.schema";
import { releaseVersion } from "@/config/version";

/** HenglosIO's tags, newest pages first — releases are the vX.Y.Z ones. */
const TAGS_URL = `${HENGLOSIO_REPOSITORY.replace("https://github.com/", "https://api.github.com/repos/")}/tags?per_page=100`;
/** How long an answer is kept — GitHub allows 60 unauthenticated calls an hour per address. */
const TTL_MS = 6 * 60 * 60 * 1000;
/** How long before asking again after GitHub didn't answer. */
const RETRY_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 5000;

/** A release tag: v1.2.3, v1.2.0-beta. */
const RELEASE_TAG = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

/**
 * Whether a newer HenglosIO than the one running was released — the newest
 * vX.Y.Z tag on GitHub against HIO_VERSION. A prerelease is offered only to
 * an installation already on one. Asked at most every few hours; off with
 * HIO_UPDATE_CHECK=false.
 */
@Injectable()
export class GetUpdateStatusUseCase {

	private readonly logger = new Logger(GetUpdateStatusUseCase.name);
	private readonly current: string | null;
	private readonly enabled: boolean;
	private latest: { version: string | null; until: number } | null = null;
	private pending: Promise<string | null> | null = null;

	constructor(config: ConfigService<Env, true>) {
		this.current = releaseVersion(config.get("HIO_VERSION", { infer: true }));
		this.enabled = config.get("HIO_UPDATE_CHECK", { infer: true });
	}

	async execute(): Promise<UpdateStatusOut> {
		// Unknown version: nothing to compare with, so GitHub isn't asked.
		const latest = this.enabled && this.current ? await this.latestRelease() : null;
		const available = !!latest && !!this.current && semver.gt(latest, this.current);
		return {
			current: this.current,
			latest,
			available,
			url: available ? `${HENGLOSIO_REPOSITORY}/releases/tag/v${latest}` : null,
		};
	}

	private async latestRelease(): Promise<string | null> {
		if (this.latest && Date.now() < this.latest.until) return this.latest.version;
		// One request at a time, however many studios ask together.
		this.pending ??= this.fetchLatest().then(
			version => {
				this.latest = { version, until: Date.now() + TTL_MS };
				return version;
			},
			(error: unknown) => {
				this.logger.warn(`Couldn't check GitHub for a newer release: ${error instanceof Error ? error.message : String(error)}`);
				this.latest = { version: null, until: Date.now() + RETRY_MS };
				return null;
			},
		).finally(() => { this.pending = null; });
		return this.pending;
	}

	private async fetchLatest(): Promise<string | null> {
		const response = await fetch(TAGS_URL, {
			headers: { Accept: "application/vnd.github+json", "User-Agent": "henglosio-hosting" },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!response.ok) throw new Error(`GitHub answered ${response.status}`);

		const tags = await response.json() as { name: string }[];
		const withPrereleases = !!this.current && semver.prerelease(this.current) !== null;
		const versions = tags
			.map(tag => RELEASE_TAG.exec(tag.name)?.[1])
			.filter((version): version is string => !!version && semver.valid(version) !== null)
			.filter(version => withPrereleases || semver.prerelease(version) === null);
		return semver.rsort(versions)[0] ?? null;
	}

}
