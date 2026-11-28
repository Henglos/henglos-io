import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { arch, platform, release } from "os";
import { dirname } from "path";
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PostHog } from "posthog-node";

import type { Env } from "@/config/env.schema";
import { releaseVersion } from "@/config/version";
import type { IStatsRepository } from "@/domain/repositories/IStatsRepository.repo";

/** Every event this installation can send — see docs/telemetry.md. */
export type TelemetryEvent =
	| "instance_started"
	| "instance_heartbeat"
	| "user_registered"
	| "workflow_created"
	| "workflow_imported"
	| "workflow_exported"
	| "component_added"
	| "board_changed"
	| "package_added"
	| "driver_paired"
	| "task_started"
	| "task_finished";

/** What an event carries: plain values only — no names people typed, no ids of theirs. */
export type TelemetryProperties = Record<string, string | number | boolean | null | Record<string, number>>;

/**
 * A package as telemetry names it: an official one (@henglosio/…) by its
 * name — a private one or another registry's may say something about whoever
 * added it, so it's only "third-party".
 */
export const packageName = (spec: string): string => spec.startsWith("@henglosio/") ? spec : "third-party";

// An error id worth counting ("driver_disconnected", "resource_busy") — free text
// (it may name an action or a file of the user's) is never sent.
const ERROR_CODE = /^[a-z][a-z0-9_]{1,63}$/;

/**
 * Anonymous telemetry: how many installations there are, which versions, how
 * big they are and what's used (components, platforms, compiles…) — to know
 * where the product goes. Sent to PostHog under a random id of this
 * installation (HIO_TELEMETRY_ID_FILE), never a person's: no person profiles,
 * no geo-IP, nothing anyone wrote (workflow names, configs, code, files).
 *
 * Off with HIO_TELEMETRY=false (or DO_NOT_TRACK=1), or with an empty
 * HIO_TELEMETRY_KEY. HIO_TELEMETRY_DEBUG=true logs each event as it goes.
 * It never throws: a telemetry failure is never the user's problem.
 */
@Injectable()
export class TelemetryService implements OnApplicationBootstrap, OnModuleDestroy {

	private readonly logger = new Logger(TelemetryService.name);
	private readonly client: PostHog | null;
	private readonly debug: boolean;
	// The release it is (HIO_VERSION) — "unknown" for a dev run or an edge build.
	private readonly version: string;
	private readonly startedAt = Date.now();
	private instanceId = "";
	// Tasks since the last heartbeat, by type — what the heartbeat reports besides the totals.
	private tasks: Record<string, number> = {};

	constructor(
		config: ConfigService<Env, true>,
		@Inject("IStatsRepository") private readonly stats: IStatsRepository,
	) {
		const enabled = config.get("HIO_TELEMETRY", { infer: true }) && !config.get("DO_NOT_TRACK", { infer: true });
		const key = config.get("HIO_TELEMETRY_KEY", { infer: true });
		this.debug = config.get("HIO_TELEMETRY_DEBUG", { infer: true });
		this.version = releaseVersion(config.get("HIO_VERSION", { infer: true })) ?? "unknown";

		if (!enabled) {
			this.logger.log("Telemetry is off (HIO_TELEMETRY=false or DO_NOT_TRACK=1).");
			this.client = null;
			return;
		}
		if (!key) {
			this.logger.log("Telemetry has no key (HIO_TELEMETRY_KEY) — nothing is sent.");
			this.client = null;
			return;
		}

		this.instanceId = this.loadInstanceId(config.get("HIO_TELEMETRY_ID_FILE", { infer: true }));
		this.client = new PostHog(key, {
			host: config.get("HIO_TELEMETRY_HOST", { infer: true }),
			flushAt: 20,
			flushInterval: 30_000,
		});
		this.logger.log("Anonymous telemetry is on — counts and versions only, nothing you write (see docs/telemetry.md). Turn it off with HIO_TELEMETRY=false.");
	}

	/** Whether events are sent — on, and with a key. */
	get enabled(): boolean {
		return this.client !== null;
	}

	/** Reports the start: which versions and environment this installation runs on. */
	onApplicationBootstrap(): void {
		this.capture("instance_started", {
			node: process.version,
			os: platform(),
			os_release: release(),
			arch: arch(),
			database: process.env["HIO_DATABASE_PROVIDER"] ?? "sqlite",
		});
		// The first heartbeat a little after starting — the totals, before a day goes by.
		if (this.enabled) setTimeout(() => void this.heartbeat(), 60_000).unref();
	}

	async onModuleDestroy(): Promise<void> {
		await this.client?.shutdown(5_000).catch(() => undefined);
	}

	/** Sends `event` — or does nothing, when telemetry is off. Never throws. */
	capture(event: TelemetryEvent, properties: TelemetryProperties = {}): void {
		if (!this.client) return;
		try {
			const payload = { ...properties, hosting_version: this.version };
			if (this.debug) this.logger.log(`[telemetry] ${event} ${JSON.stringify(payload)}`);
			this.client.capture({
				distinctId: this.instanceId,
				event,
				// An installation, not a person: no person profile, no location from its IP.
				properties: { ...payload, $process_person_profile: false },
				disableGeoip: true,
			});
		} catch (error) {
			this.logger.debug(`Telemetry event ${event} not sent: ${(error as Error).message}`);
		}
	}

	/** A task (compile, flash, execute, record, run, debug, repl…) began. */
	taskStarted(type: string, label: string): void {
		this.tasks[label] = (this.tasks[label] ?? 0) + 1;
		this.capture("task_started", { type, label });
	}

	/** …and how it ended. Only a short error id is sent, never its message. */
	taskFinished(type: string, label: string, outcome: string, durationMs: number | null, error?: string): void {
		this.capture("task_finished", {
			type,
			label,
			outcome,
			duration_ms: durationMs,
			error_code: error && ERROR_CODE.test(error) ? error : error ? "other" : null,
		});
	}

	/** Once a day: how big the installation is, and what ran since the last one. */
	@Cron(CronExpression.EVERY_DAY_AT_4AM)
	async heartbeat(): Promise<void> {
		if (!this.client) return;
		try {
			const stats = await this.stats.instance();
			const tasks = this.tasks;
			this.tasks = {};
			this.capture("instance_heartbeat", {
				users: stats.users,
				workflows: stats.workflows,
				drivers: stats.drivers,
				boards: stats.boards,
				components: stats.components,
				// Official packages by name; the rest summed up as third-party.
				component_usage: Object.entries(stats.componentUsage).reduce<Record<string, number>>((usage, [spec, workflows]) => {
					const name = packageName(spec);
					usage[name] = (usage[name] ?? 0) + workflows;
					return usage;
				}, {}),
				platforms: stats.platforms,
				tasks,
				uptime_hours: Math.round((Date.now() - this.startedAt) / 3_600_000),
			});
		} catch (error) {
			this.logger.debug(`Telemetry heartbeat not sent: ${(error as Error).message}`);
		}
	}

	// The installation's random id: made once, kept in `file` — the same across restarts.
	private loadInstanceId(file: string): string {
		try {
			const existing = readFileSync(file, "utf-8").trim();
			if (existing) return existing;
		} catch {
			// not made yet
		}
		const id = randomUUID();
		try {
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, id);
		} catch (error) {
			this.logger.debug(`Telemetry id not saved (${(error as Error).message}) — a new one each start.`);
		}
		return id;
	}

}
