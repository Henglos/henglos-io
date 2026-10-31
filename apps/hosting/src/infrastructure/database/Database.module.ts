import { Module, Provider } from '@nestjs/common';
import { UserSqliteRepo } from './drizzle/sqlite/UserSqliteRepo.impl';
import { SqliteConnection } from './drizzle/sqlite/SqliteConnection';
import { WorkflowSqliteRepo } from './drizzle/sqlite/WorkflowSqliteRepo.impl';
import { DriverSqliteRepo } from './drizzle/sqlite/DriverSqliteRepo.impl';
import { PackageSqliteRepo } from './drizzle/sqlite/PackageSqliteRepo.impl';
import { AccountPackageSqliteRepo } from './drizzle/sqlite/AccountPackageSqliteRepo.impl';
import { PackageLinkSqliteRepo } from './drizzle/sqlite/PackageLinkSqliteRepo.impl';
import { DriverPairTokenSqliteRepo } from './drizzle/sqlite/DriverPairTokenSqliteRepo.impl';
import { WorkflowFileSqliteRepo } from './drizzle/sqlite/WorkflowFileSqliteRepo.impl';
import { CredentialSqliteRepo } from './drizzle/sqlite/CredentialSqliteRepo.impl';
import { StatsSqliteRepo } from './drizzle/sqlite/StatsSqliteRepo.impl';

const REPOSITORY_TOKENS = [
	'IUserRepository',
	'IWorkflowRepository',
	'IDriverRepository',
	'IPackageRepository',
	'IAccountPackageRepository',
	'IPackageLinkRepository',
	'IDriverPairTokenRepository',
	'IWorkflowFileRepository',
	'ICredentialRepository',
	'IStatsRepository',
] as const;


// The repositories for HIO_DATABASE_PROVIDER — only `sqlite` for now. Each
// is provided under its interface's name ("IUserRepository"…), so the
// application never names an implementation.
function buildDatabaseProviders(): Provider[] {

	const databaseProvider = process.env['HIO_DATABASE_PROVIDER'] ?? 'sqlite';

	let impls: Provider[] = [];

	if (databaseProvider === 'sqlite') {
		impls.push(...[
			SqliteConnection,
			{ provide: 'IUserRepository', useClass: UserSqliteRepo },
			{ provide: 'IWorkflowRepository', useClass: WorkflowSqliteRepo },
			{ provide: 'IDriverRepository', useClass: DriverSqliteRepo },
			{ provide: 'IPackageRepository', useClass: PackageSqliteRepo },
			{ provide: 'IAccountPackageRepository', useClass: AccountPackageSqliteRepo },
			{ provide: 'IPackageLinkRepository', useClass: PackageLinkSqliteRepo },
			{ provide: 'IDriverPairTokenRepository', useClass: DriverPairTokenSqliteRepo },
			{ provide: 'IWorkflowFileRepository', useClass: WorkflowFileSqliteRepo },
			{ provide: 'ICredentialRepository', useClass: CredentialSqliteRepo },
			{ provide: 'IStatsRepository', useClass: StatsSqliteRepo },
		]);
	}



	return impls;

}

/** The database and its repositories, by their interface's token (see REPOSITORY_TOKENS). */
@Module({
	providers: buildDatabaseProviders(),
	exports: [...REPOSITORY_TOKENS],
})
export class DatabaseModule {}
