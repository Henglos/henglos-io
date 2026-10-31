import { Injectable } from "@nestjs/common";
import { IPackageLinkRepository } from "@/domain/repositories/IPackageLinkRepository.repo";
import { PackageLink } from "@/domain/entities/PackageLink";
import { Package } from "@/domain/entities/Package";
import { AccountPackage } from "@/domain/entities/AccountPackage";
import { SqliteConnection } from './SqliteConnection';
import type { IBoardSchema, IComponentSchema } from "@henglosio/workflow";
import { eq } from 'drizzle-orm';
import { packageLinks, packages } from './schema';

type PackageRow = typeof packages.$inferSelect;

type PackageLinkRow = typeof packageLinks.$inferSelect & {
	package: PackageRow | null;
	accountPackage: ({ id: string; userId: string; token: string | null; package: PackageRow }) | null;
};

/**
 * IPackageLinkRepository on SQLite: the `package_links` table, each link
 * loaded with its package (native) or its account package (user).
 */
@Injectable()
export class PackageLinkSqliteRepo implements IPackageLinkRepository {

	constructor(private readonly database: SqliteConnection) {}

	private pkgToDomain(row: PackageRow): Package {
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

	private toDomain(raw: PackageLinkRow): PackageLink {

		const pkg = raw.package ? this.pkgToDomain(raw.package) : null;

		const accountPkg = raw.accountPackage
			? new AccountPackage(
				raw.accountPackage.id,
				raw.accountPackage.userId,
				this.pkgToDomain(raw.accountPackage.package),
				raw.accountPackage.token,
			)
			: null;

		return new PackageLink(raw.id, raw.origin, pkg, accountPkg);

	}

	private readonly withRelations = {
		package: true,
		accountPackage: { with: { package: true } },
	} as const;

	async save(link: PackageLink): Promise<PackageLink> {

		const raw = await this.database.connection(async (db) => {

			const [row] = await db.insert(packageLinks).values({
				packageId: link.pkg?.id ?? undefined,
				accountPackageId: link.accountPackage?.id ?? undefined,
				origin: link.origin,
			}).returning();

			return db.query.packageLinks.findFirst({
				where: eq(packageLinks.id, row.id),
				with: this.withRelations,
			});

		});

		return this.toDomain(raw as unknown as PackageLinkRow);

	}

	async findById(id: string): Promise<PackageLink | null> {

		const raw = await this.database.connection((db) => db.query.packageLinks.findFirst({
			where: eq(packageLinks.id, id),
			with: this.withRelations,
		}));
		return raw ? this.toDomain(raw as unknown as PackageLinkRow) : null;

	}

	async delete(id: string): Promise<void> {

		await this.database.connection((db) => db.delete(packageLinks).where(eq(packageLinks.id, id)));

	}

	async detach(id: string): Promise<void> {

		await this.database.connection((db) => db.update(packageLinks)
			.set({ packageId: null, accountPackageId: null })
			.where(eq(packageLinks.id, id)));

	}
}
