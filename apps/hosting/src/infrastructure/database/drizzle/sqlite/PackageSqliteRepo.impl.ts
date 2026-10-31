import { Injectable } from '@nestjs/common';
import { IPackageRepository } from '@/domain/repositories/IPackageRepository.repo';
import { Package } from '@/domain/entities/Package';
import { SqliteConnection } from './SqliteConnection';
import type { IBoardSchema, IComponentSchema } from '@henglosio/workflow';
import { and, eq } from 'drizzle-orm';
import { packages } from './schema';

/** IPackageRepository on SQLite: the `packages` table. */
@Injectable()
export class PackageSqliteRepo implements IPackageRepository {
	constructor(private readonly database: SqliteConnection) {}

	private toDomain(row: typeof packages.$inferSelect): Package {
		return new Package(
			row.id,
			row.name,
			row.spec,
			row.version,
			row.author,
			row.description,
			row.type,
			row.schema as IBoardSchema | IComponentSchema,
			row.registry,
			row.platform,
		);
	}

	async save(pkg: Package): Promise<Package> {

		const [row] = await this.database.connection((db) => db.insert(packages).values({
			name: pkg.name,
			spec: pkg.spec,
			version: pkg.version,
			author: pkg.author,
			description: pkg.description,
			type: pkg.type,
			schema: pkg.schema,
			registry: pkg.registry,
			platform: pkg.platform,
		}).returning());

		return this.toDomain(row);

	}

	async findById(id: string): Promise<Package | null> {

		const row = await this.database.connection((db) => db.query.packages.findFirst({ where: eq(packages.id, id) }));
		return row ? this.toDomain(row) : null;

	}

	async findByNameVersion(spec: string, version: string): Promise<Package | null> {

		const row = await this.database.connection((db) => db.query.packages.findFirst({
			where: and(eq(packages.spec, spec), eq(packages.version, version)),
		}));
		return row ? this.toDomain(row) : null;

	}

	async findAllByName(spec: string): Promise<Package[]> {

		const rows = await this.database.connection((db) => db.query.packages.findMany({ where: eq(packages.spec, spec) }));
		return rows.map((row) => this.toDomain(row));

	}
}
