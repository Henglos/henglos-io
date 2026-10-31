import { DriverPairToken } from '@/domain/entities/DriverPairToken';
import { SqliteConnection } from './SqliteConnection';
import type { IDriverPairTokenRepository } from '@/domain/repositories/IDriverPairTokenRepository.repo';
import { Injectable } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import { driverPairTokens } from './schema';

/** IDriverPairTokenRepository on SQLite: the `driver_pair_token` table. */
@Injectable()
export class DriverPairTokenSqliteRepo implements IDriverPairTokenRepository {

	constructor(private readonly database: SqliteConnection) {}

	private toDomain(row: typeof driverPairTokens.$inferSelect): DriverPairToken {
		return new DriverPairToken(row.id, row.userId, row.token!, row.expiresAt, row.createdAt);
	}

	async save(driverPair: DriverPairToken): Promise<DriverPairToken> {

		const [row] = await this.database.connection((db) => db.insert(driverPairTokens).values({
			userId: driverPair.userId,
			token: driverPair.token,
			expiresAt: driverPair.expiresAt,
			createdAt: driverPair.createdAt,
		}).returning());

		return this.toDomain(row);

	}

	async findByPairToken(token: string): Promise<DriverPairToken | null> {

		const row = await this.database.connection((db) => db.query.driverPairTokens.findFirst({
			where: eq(driverPairTokens.token, token),
		}));

		return row ? this.toDomain(row) : null;

	}

	async delete(id: string): Promise<boolean> {

		const rows = await this.database.connection((db) => db.delete(driverPairTokens).where(eq(driverPairTokens.id, id)).returning());
		return rows.length > 0;

	}

	async deleteExpired(): Promise<number> {

		const rows = await this.database.connection((db) => db.delete(driverPairTokens)
			.where(lt(driverPairTokens.expiresAt, new Date()))
			.returning());

		return rows.length;

	}

}
