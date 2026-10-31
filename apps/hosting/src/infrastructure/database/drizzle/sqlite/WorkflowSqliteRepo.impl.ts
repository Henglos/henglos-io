import type { IWorkflowRuntime } from '@henglosio/workflow';
import type { IBoardSchema, IComponentSchema } from '@henglosio/workflow';

import { SqliteConnection, type DrizzleDb } from './SqliteConnection';

import { Workflow } from '@/domain/entities/Workflow';
import {
	IWorkflowRepository,
	WorkflowsSegment,
} from '@/domain/repositories/IWorkflowRepository.repo';
import { Injectable } from '@nestjs/common';
import { PackageLink } from '@/domain/entities/PackageLink';
import { Package } from '@/domain/entities/Package';
import { AccountPackage } from '@/domain/entities/AccountPackage';
import { and, count, eq, exists, or, sql } from 'drizzle-orm';
import { packageLinks, packages, workflowComponents, workflows } from './schema';

type RawPkg = typeof packages.$inferSelect;

type PackageLinkRow = typeof packageLinks.$inferSelect & {
	package: RawPkg | null;
	accountPackage: {
		id: string;
		userId: string;
		token: string | null;
		package: RawPkg;
	} | null;
};

type WorkflowRow = typeof workflows.$inferSelect & {
	workflowComponents: { packageLink: PackageLinkRow }[];
};

/**
 * IWorkflowRepository on SQLite: the `workflows` table, with its components
 * (`workflow_components` → `package_links`) loaded along — see withComponents.
 */
@Injectable()
export class WorkflowSqliteRepo implements IWorkflowRepository {
	constructor(private readonly database: SqliteConnection) {}

	private rawToPkg(r: RawPkg): Package {
		return new Package(
			r.id,
			r.name,
			r.spec,
			r.version,
			r.author,
			r.description,
			r.type,
			r.schema as IBoardSchema | IComponentSchema,
			r.registry,
			r.platform,
		);
	}

	private linkToDomain(raw: PackageLinkRow): PackageLink {
		const pkg = raw.package ? this.rawToPkg(raw.package) : null;

		const accountPkg = raw.accountPackage
			? new AccountPackage(
					raw.accountPackage.id,
					raw.accountPackage.userId,
					this.rawToPkg(raw.accountPackage.package),
					raw.accountPackage.token,
				)
			: null;

		return new PackageLink(raw.id, raw.origin, pkg, accountPkg);
	}

	private toEntity(row: WorkflowRow): Workflow {
		return new Workflow(
			row.id,
			row.userId,
			row.data as IWorkflowRuntime,
			row.boardId,
			row.platform,
			row.workflowComponents.map((c) => this.linkToDomain(c.packageLink)),
			row.createdAt,
			row.updatedAt,
		);
	}

	// What a query loads with each workflow: its components' links, each with its package.
	private readonly withComponents = {
		workflowComponents: {
			with: {
				packageLink: {
					with: {
						package: true,
						accountPackage: { with: { package: true } },
					},
				},
			},
		},
	} as const;

	// Makes the workflow's component rows exactly `components`: the old ones go, these go in.
	private async syncComponents(db: DrizzleDb, workflowId: string, components: PackageLink[]): Promise<void> {

		await db.delete(workflowComponents).where(eq(workflowComponents.workflowId, workflowId));

		if (components.length === 0) return;

		await db.insert(workflowComponents).values(
			components.map((c) => ({ workflowId, packageLinkId: c.id! })),
		);

	}

	async save(workflow: Workflow): Promise<Workflow> {

		const row = await this.database.connection(async (db) => {

			const [_workflow] = await db.insert(workflows).values({
				userId: workflow.userId,
				data: workflow.data,
				boardId: workflow.boardId,
				platform: workflow.platform,
				createdAt: workflow.createdAt,
				updatedAt: workflow.updatedAt,
			}).returning();

			await this.syncComponents(db, _workflow.id, workflow.components);

			return db.query.workflows.findFirst({
				where: eq(workflows.id, _workflow.id),
				with: this.withComponents,
			});

		});

		return this.toEntity(row as unknown as WorkflowRow);

	}

	async findById(id: string): Promise<Workflow | null> {

		const row = await this.database.connection((db) => db.query.workflows.findFirst({
			where: eq(workflows.id, id),
			with: this.withComponents,
		}));
		if (!row) return null;
		return this.toEntity(row as unknown as WorkflowRow);

	}

	async findPaginatedByUser(
		userId: string,
		query: string,
		segment: number,
		length: number,
	): Promise<WorkflowsSegment> {

		const nameMatch = sql`json_extract(${workflows.data}, '$.name') LIKE ${`%${query}%`}`;
		const descriptionMatch = sql`json_extract(${workflows.data}, '$.description') LIKE ${`%${query}%`}`;

		const rows = await this.database.connection((db) => db.query.workflows.findMany({
			where: and(
				eq(workflows.userId, userId),
				query ? or(nameMatch, descriptionMatch) : undefined,
			),
			// Most recently edited first.
			orderBy: (row, { desc }) => [desc(row.updatedAt)],
			limit: length,
			offset: segment * length,
			with: this.withComponents,
		}));

		const nextSegment = rows.length < length ? undefined : segment + 1;

		return {
			workflows: rows.map((w) => this.toEntity(w as unknown as WorkflowRow)),
			nextSegment,
		};

	}

	async findAllByUser(userId: string): Promise<Workflow[]> {

		const rows = await this.database.connection((db) => db.query.workflows.findMany({
			where: eq(workflows.userId, userId),
			with: this.withComponents,
		}));
		return rows.map((w) => this.toEntity(w as unknown as WorkflowRow));

	}

	async existsById(id: string): Promise<boolean> {

		const rows = await this.database.connection((db) => db.select({ id: workflows.id }).from(workflows).where(eq(workflows.id, id)));
		return rows.length > 0;

	}

	async existsByName(userId: string, name: string): Promise<boolean> {

		const rows = await this.database.connection((db) => db.select({ id: workflows.id }).from(workflows).where(and(
			eq(workflows.userId, userId),
			sql`json_extract(${workflows.data}, '$.name') = ${name}`,
		)));
		return rows.length > 0;

	}

	async countByUser(userId: string): Promise<number> {

		const [row] = await this.database.connection((db) => db.select({ value: count() }).from(workflows).where(eq(workflows.userId, userId)));
		return row.value;

	}

	async isPackageInUse(packageId: string): Promise<boolean> {

		const rows = await this.database.connection((db) => {

			const componentSub = db.select({ one: sql`1` }).from(workflowComponents).where(and(
				eq(workflowComponents.workflowId, workflows.id),
				eq(workflowComponents.packageLinkId, packageId),
			));

			return db.select({ id: workflows.id }).from(workflows).where(
				or(eq(workflows.boardId, packageId), exists(componentSub)),
			);

		});

		return rows.length > 0;

	}

	async update(workflow: Workflow): Promise<void> {

		await this.database.connection(async (db) => {

			await db.update(workflows).set({
				data: workflow.data,
				boardId: workflow.boardId,
				platform: workflow.platform,
				updatedAt: workflow.updatedAt,
			}).where(eq(workflows.id, workflow.id!));

			await this.syncComponents(db, workflow.id!, workflow.components);

		});

	}

	async findCollabState(id: string): Promise<Uint8Array | null> {

		const [row] = await this.database.connection((db) =>
			db.select({ collabState: workflows.collabState }).from(workflows).where(eq(workflows.id, id)),
		);

		return row?.collabState ? new Uint8Array(row.collabState) : null;

	}

	async saveCollabState(id: string, data: IWorkflowRuntime, state: Uint8Array): Promise<void> {

		await this.database.connection((db) =>
			db.update(workflows).set({
				data,
				collabState: Buffer.from(state),
				updatedAt: new Date(),
			}).where(eq(workflows.id, id)),
		);

	}

	async delete(id: string): Promise<void> {

		await this.database.connection((db) => db.delete(workflows).where(eq(workflows.id, id)));

	}

	async deleteAllByUser(userId: string): Promise<void> {

		await this.database.connection((db) => db.delete(workflows).where(eq(workflows.userId, userId)));

	}
}
