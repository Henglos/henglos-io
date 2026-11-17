import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { IDefaultPackageOfferRepository } from '@/domain/repositories/IDefaultPackageOfferRepository.repo';
import { SqliteConnection } from './SqliteConnection';
import { defaultPackageOffers } from './schema';

/** IDefaultPackageOfferRepository on SQLite: the `default_package_offers` table. */
@Injectable()
export class DefaultPackageOfferSqliteRepo implements IDefaultPackageOfferRepository {

	constructor(private readonly database: SqliteConnection) {}

	async findNamesByUser(userId: string): Promise<string[]> {

		const rows = await this.database.connection((db) => db
			.select({ name: defaultPackageOffers.name })
			.from(defaultPackageOffers)
			.where(eq(defaultPackageOffers.userId, userId)));
		return rows.map((row) => row.name);

	}

	async save(userId: string, name: string): Promise<void> {

		await this.database.connection((db) => db
			.insert(defaultPackageOffers)
			.values({ userId, name })
			.onConflictDoNothing());

	}

}
