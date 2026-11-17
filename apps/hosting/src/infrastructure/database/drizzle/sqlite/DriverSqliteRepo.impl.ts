import { Driver } from '@/domain/entities/Driver';
import { SqliteConnection } from './SqliteConnection';
import type { IDriverRepository } from '@/domain/repositories/IDriverRepository.repo';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drivers } from './schema';

/** IDriverRepository on SQLite: the `drivers` table. */
@Injectable()
export class DriverSqliteRepo implements IDriverRepository {

	constructor(private readonly database: SqliteConnection) {}

	private toDomain(row: typeof drivers.$inferSelect): Driver {
		return new Driver(
			row.id,
			row.userId,
			row.deviceName!,
			row.deviceUser!,
			row.name,
			row.refreshToken,
			row.refreshTokenExpiresAt,
		);
	}

	async save(driver: Driver): Promise<Driver> {

		const [_driver] = await this.database.connection((db) => db.insert(drivers).values({
			userId: driver.userId,
			deviceName: driver.deviceName,
			deviceUser: driver.deviceUser,
			name: driver.name,
			refreshToken: driver.refreshToken,
			refreshTokenExpiresAt: driver.refreshTokenExpiresAt,
		}).returning());

		return this.toDomain(_driver);

	}

	async update(driver: Driver): Promise<Driver> {

		const [_driver] = await this.database.connection((db) => db.update(drivers).set({
			name: driver.name,
			refreshToken: driver.refreshToken,
			refreshTokenExpiresAt: driver.refreshTokenExpiresAt,
		}).where(eq(drivers.id, driver.id!)).returning());

		return this.toDomain(_driver);

	}

	async findById(id: string): Promise<Driver | null> {

		const row = await this.database.connection((db) => db.query.drivers.findFirst({ where: eq(drivers.id, id) }));
		return row ? this.toDomain(row) : null;

	}

	async findByRefreshToken(hashedToken: string): Promise<Driver | null> {

		const row = await this.database.connection((db) => db.query.drivers.findFirst({ where: eq(drivers.refreshToken, hashedToken) }));
		return row ? this.toDomain(row) : null;

	}

	async findAllByUser(userId: string): Promise<Driver[]> {

		const rows = await this.database.connection((db) => db.query.drivers.findMany({ where: eq(drivers.userId, userId) }));
		return rows.map((row) => this.toDomain(row));

	}

	async delete(id: string): Promise<void> {

		await this.database.connection((db) => db.delete(drivers).where(eq(drivers.id, id)));

	}

}
