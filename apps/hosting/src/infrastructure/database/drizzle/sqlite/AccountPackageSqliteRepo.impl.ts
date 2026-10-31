import { Injectable } from "@nestjs/common";
import { IAccountPackageRepository, AccountPackageFilters } from "@/domain/repositories/IAccountPackageRepository.repo";
import { AccountPackage } from "@/domain/entities/AccountPackage";
import { Package } from "@/domain/entities/Package";
import { SqliteConnection } from './SqliteConnection';
import type { IBoardSchema, IComponentSchema } from "@henglosio/workflow";
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { accountPackages, packageLinks, packages, workflowComponents, workflows } from './schema';

/** IAccountPackageRepository on SQLite: the `account_packages` table, each row loaded with its package. */
@Injectable()
export class AccountPackageSqliteRepo implements IAccountPackageRepository {

	constructor(private readonly database: SqliteConnection) {}

	private packageToDomain(row: typeof packages.$inferSelect): Package {
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

	private toDomain(row: typeof accountPackages.$inferSelect & { package: typeof packages.$inferSelect }): AccountPackage {
		return new AccountPackage(
			row.id,
			row.userId,
			this.packageToDomain(row.package),
			row.token,
		);
	}

	async save(pkg: AccountPackage): Promise<AccountPackage> {

		const raw = await this.database.connection(async (db) => {

			const [row] = await db.insert(accountPackages).values({
				userId: pkg.userId,
				packageId: pkg.pkg.id!,
				token: pkg.token,
			}).returning();

			return db.query.accountPackages.findFirst({
				where: eq(accountPackages.id, row.id),
				with: { package: true },
			});

		});

		return this.toDomain(raw!);

	}

	async findById(id: string): Promise<AccountPackage | null> {

		const raw = await this.database.connection((db) => db.query.accountPackages.findFirst({
			where: eq(accountPackages.id, id),
			with: { package: true },
		}));
		return raw ? this.toDomain(raw) : null;

	}

	async findByUserPackage(userId: string, packageId: string): Promise<AccountPackage | null> {

		const raw = await this.database.connection((db) => db.query.accountPackages.findFirst({
			where: and(eq(accountPackages.userId, userId), eq(accountPackages.packageId, packageId)),
			with: { package: true },
		}));
		return raw ? this.toDomain(raw) : null;

	}

	async findAllByUser(userId: string, filters?: AccountPackageFilters): Promise<AccountPackage[]> {

		const rows = await this.database.connection((db) => db
			.select({ accountPackage: accountPackages, package: packages })
			.from(accountPackages)
			.innerJoin(packages, eq(accountPackages.packageId, packages.id))
			.where(and(
				eq(accountPackages.userId, userId),
				filters?.q ? like(packages.name, `%${filters.q}%`) : undefined,
				filters?.type ? eq(packages.type, filters.type) : undefined,
			)));

		return rows.map((r) => this.toDomain({ ...r.accountPackage, package: r.package }));

	}

	// A workflow points at a package through a package link: its board_id, or a
	// workflow_components row — every link of this account package counts.
	async findBoardWorkflowIds(id: string): Promise<string[]> {

		const rows = await this.database.connection((db) => {
			const links = db.select({ id: packageLinks.id }).from(packageLinks).where(eq(packageLinks.accountPackageId, id));
			return db.select({ id: workflows.id }).from(workflows).where(inArray(workflows.boardId, links));
		});

		return rows.map(row => row.id);

	}

	async isUsedAsComponent(id: string): Promise<boolean> {

		const rows = await this.database.connection((db) => {
			const links = db.select({ id: packageLinks.id }).from(packageLinks).where(eq(packageLinks.accountPackageId, id));
			return db.select({ one: sql`1` }).from(workflowComponents).where(inArray(workflowComponents.packageLinkId, links)).limit(1);
		});

		return rows.length > 0;

	}

	// Its links go first — the account package can't be removed while a row
	// references it. Links a removed workflow left behind are what's there.
	async delete(id: string): Promise<void> {

		await this.database.connection(async (db) => db.transaction((tx) => {
			tx.delete(packageLinks).where(eq(packageLinks.accountPackageId, id)).run();
			tx.delete(accountPackages).where(eq(accountPackages.id, id)).run();
		}));

	}
}
