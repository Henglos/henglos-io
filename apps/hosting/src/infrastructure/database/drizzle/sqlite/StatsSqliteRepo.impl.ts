import { Injectable } from '@nestjs/common';
import { count, countDistinct, eq, inArray } from 'drizzle-orm';
import type { IStatsRepository, InstanceStats } from '@/domain/repositories/IStatsRepository.repo';
import { SqliteConnection } from './SqliteConnection';
import { accountPackages, drivers, packages, users, workflows } from './schema';

/** IStatsRepository on SQLite: counts over the whole database. */
@Injectable()
export class StatsSqliteRepo implements IStatsRepository {

	constructor(private readonly database: SqliteConnection) {}

	async instance(): Promise<InstanceStats> {
		return this.database.connection(async (db) => {

			const total = async (table: typeof users | typeof workflows | typeof drivers) =>
				(await db.select({ value: count() }).from(table))[0]?.value ?? 0;

			const kinds = await db.select({ type: packages.type, value: countDistinct(packages.spec) }).from(packages).groupBy(packages.type);

			// A workflow's components are in its `data` (each by its account
			// package's id) — counted once per workflow, by package spec.
			const perWorkflow = (await db.select({ data: workflows.data }).from(workflows)).map(row => {
				const components = (row.data as { components?: { packageId?: unknown }[] } | null)?.components ?? [];
				return new Set(components.map(component => component.packageId).filter((id): id is string => typeof id === 'string'));
			});
			const ids = [...new Set(perWorkflow.flatMap(set => [...set]))];
			const specs = new Map(ids.length === 0 ? [] : (await db
				.select({ id: accountPackages.id, spec: packages.spec })
				.from(accountPackages)
				.innerJoin(packages, eq(accountPackages.packageId, packages.id))
				.where(inArray(accountPackages.id, ids))).map(row => [row.id, row.spec] as const));
			const componentUsage: Record<string, number> = {};
			for (const set of perWorkflow) {
				for (const spec of new Set([...set].map(id => specs.get(id)).filter((spec): spec is string => !!spec))) {
					componentUsage[spec] = (componentUsage[spec] ?? 0) + 1;
				}
			}

			const platforms = await db.select({ version: workflows.platform, value: count() }).from(workflows).groupBy(workflows.platform);

			return {
				users: await total(users),
				workflows: await total(workflows),
				drivers: await total(drivers),
				boards: kinds.find(kind => kind.type === 'board')?.value ?? 0,
				components: kinds.find(kind => kind.type === 'component')?.value ?? 0,
				componentUsage,
				platforms: Object.fromEntries(platforms.map(row => [row.version, row.value])),
			};

		});
	}

}
