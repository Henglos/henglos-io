import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Credential } from '@/domain/entities/Credential';
import type { ICredentialRepository } from '@/domain/repositories/ICredentialRepository.repo';
import { SqliteConnection } from './SqliteConnection';
import { credentials } from './schema';

/** ICredentialRepository on SQLite: the `credentials` table. */
@Injectable()
export class CredentialSqliteRepo implements ICredentialRepository {

	constructor(private readonly database: SqliteConnection) {}

	async create(credential: Pick<Credential, 'userId' | 'type' | 'name' | 'data'>): Promise<Credential> {
		const [row] = await this.database.connection((db) => db.insert(credentials).values(credential).returning());
		return row;
	}

	async update(id: string, changes: Partial<Pick<Credential, 'name' | 'data'>>): Promise<Credential> {
		const [row] = await this.database.connection((db) => db.update(credentials)
			.set({ ...changes, updatedAt: new Date() })
			.where(eq(credentials.id, id))
			.returning());
		return row;
	}

	async findById(id: string): Promise<Credential | null> {
		const row = await this.database.connection((db) => db.query.credentials.findFirst({ where: eq(credentials.id, id) }));
		return row ?? null;
	}

	async findByUser(userId: string): Promise<Credential[]> {
		return this.database.connection((db) => db.query.credentials.findMany({
			where: eq(credentials.userId, userId),
			orderBy: [asc(credentials.name)],
		}));
	}

	async delete(id: string): Promise<void> {
		await this.database.connection((db) => db.delete(credentials).where(eq(credentials.id, id)));
	}

}
