import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import CircuitBreaker from 'opossum';
import pRetry from 'p-retry';
import { ServiceUnavailable } from '@/application/errors/Services.error';
import { BaseError } from '@/application/errors/BaseError';
import type { Env } from '@/config/env.schema';
import * as schema from './schema';

/** The Drizzle database, typed with the schema — what a repository's queries run on. */
export type DrizzleDb = BetterSQLite3Database<typeof schema>;

/**
 * The SQLite database (HIO_DATABASE_URL, `file:<path>`), opened when the
 * hosting starts — in WAL mode, foreign keys on. Every query goes through
 * {@link connection}, behind a circuit breaker: a database that keeps
 * failing (or answers slower than 5 s) is reported as ServiceUnavailable
 * instead of piling requests up on it.
 */
@Injectable()
export class SqliteConnection implements OnModuleInit, OnModuleDestroy {

	private sqlite!: Database.Database;
	private db!: DrizzleDb;
	private readonly breaker: CircuitBreaker;

	constructor(private readonly config: ConfigService<Env, true>) {

		this.breaker = new CircuitBreaker(async (action: () => Promise<unknown>) => await action(), {
			timeout: 5000,
			errorThresholdPercentage: 50,
			resetTimeout: 10000,
		});

	}

	async onModuleInit() {

		await pRetry(
			async () => {

				const path = this.config.get('HIO_DATABASE_URL', { infer: true }).replace(/^file:/, '');
				mkdirSync(dirname(path), { recursive: true });

				this.sqlite = new Database(path);
				this.sqlite.pragma('journal_mode = WAL');
				this.sqlite.pragma('foreign_keys = ON');

				this.db = drizzle(this.sqlite, { schema });

			},
			{
				retries: 3,
				factor: 2,
				maxTimeout: 5000,
			},
		).catch(() => { throw new ServiceUnavailable(); });

	}

	async onModuleDestroy() {

		await pRetry(async () => {

			this.sqlite?.close();

		}, {
			retries: 3,
			factor: 2,
			maxTimeout: 5000,
		}).catch(() => {});

	}

	/**
	 * Runs a query on the database: `connection(db => db.select()…)`.
	 *
	 * @returns What the callback returns.
	 * @throws The callback's own BaseError as it is; ServiceUnavailable for
	 *   anything else (a database error, a timeout, the breaker open).
	 */
	async connection<T>(callback: (db: DrizzleDb) => T | Promise<T>): Promise<T> {

		return await this.breaker.fire(() => Promise.resolve(callback(this.db))).catch((err) => {

			if (err instanceof BaseError) throw err;

			console.log(err);
			throw new ServiceUnavailable();

		}) as T;

	}

}
