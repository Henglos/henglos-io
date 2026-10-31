import {
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Query,
	Body,
	UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '@/infrastructure/http/pipes/ZodValidation.pipe';

import { AuthUser } from '@/infrastructure/http/decorators/AuthUser.decorator';
import { AuthGuard } from '@/infrastructure/http/guards/Auth.guard';
import { MinimalUser } from '@/domain/entities/AuthUser';

import { AddPackageUseCase } from '@/application/use-cases/package/AddPackage.use-case';
import { DeletePackageUseCase } from '@/application/use-cases/package/DeletePackage.use-case';
import { ListPackagesUseCase } from '@/application/use-cases/package/ListPackages.use-case';
import { GetPackageUseCase } from '@/application/use-cases/package/GetPackage.use-case';
import { ListPackageVersionsUseCase } from '@/application/use-cases/package/ListPackageVersions.use-case';
import { DescribeRegistryPackageUseCase } from '@/application/use-cases/package/DescribeRegistryPackage.use-case';
import {
	RegistryPackageQuerySchema,
	type RegistryPackageQuery,
	type RegistryPackageOut,
	AddPackageInSchema,
	type AddPackageIn,
	type AddPackageOut,
	ListPackagesQuerySchema,
	type ListPackagesQuery,
	type ListPackagesOut,
	ListPackageVersionsOut,
	GetPackageSchemaOut,
	type GetPackageOut,
	type DeletePackageOut,
} from '@henglosio/shared';

/** /io/api/v1/packages — the user's library of boards and components. Every route needs a user. */
@Controller({ version: '1' })
@UseGuards(AuthGuard)
export class PackageController {
	constructor(
		private readonly addPackageUseCase: AddPackageUseCase,
		private readonly deletePackageUseCase: DeletePackageUseCase,
		private readonly listPackagesUseCase: ListPackagesUseCase,
		private readonly getPackageUseCase: GetPackageUseCase,
		private readonly listPackageVersionsUseCase: ListPackageVersionsUseCase,
		private readonly describeRegistryPackageUseCase: DescribeRegistryPackageUseCase,
	) {}

	/** POST /packages — installs a package version from its registry (`spec`, `registry?`, `token?`). */
	@Post('packages')
	async addPackage(
		@AuthUser() user: MinimalUser,
		@Body(new ZodValidationPipe(AddPackageInSchema)) body: AddPackageIn,
	): Promise<AddPackageOut> {
		const pkg = await this.addPackageUseCase.execute(
			user.userId,
			body.spec,
			body.registry,
			body.token,
		);
		return { id: pkg.id! };
	}

	/** GET /packages?q=&type= — the library, each package with its installed versions. */
	@Get('packages')
	async listPackages(
		@AuthUser() user: MinimalUser,
		@Query(new ZodValidationPipe(ListPackagesQuerySchema))
		query: ListPackagesQuery,
	): Promise<ListPackagesOut> {
		const packages = await this.listPackagesUseCase.execute(user.userId, {
			q: query.q,
			type: query.type,
		});
		return {
			packages: packages.map((p) => ({
				name: p.name,
				packageName: p.packageName,
				author: p.author,
				description: p.description,
				type: p.type,
				versions: p.versions.map((v) => ({
					id: v.accountPackageId,
					version: v.version,
					platform: v.platform,
				})),
			})),
		};
	}

	/**
	 * GET /packages/registry?name= — a package on the registry by name, before
	 * it's installed: its versions, newest first.
	 */
	// Declared before packages/:id, which would otherwise take "registry" as an id.
	@Get('packages/registry')
	async describeRegistryPackage(
		@AuthUser() user: MinimalUser,
		@Query(new ZodValidationPipe(RegistryPackageQuerySchema)) query: RegistryPackageQuery,
	): Promise<RegistryPackageOut> {
		return this.describeRegistryPackageUseCase.execute(user.userId, query.name, query.registry, query.token);
	}

	/** GET /packages/:id/versions — every version its registry has of an installed package. */
	@Get('packages/:id/versions')
	async listPackageVersions(
		@AuthUser() user: MinimalUser,
		@Param('id') id: string,
	): Promise<ListPackageVersionsOut> {
		const versions = await this.listPackageVersionsUseCase.execute(
			user.userId,
			id,
		);
		return { versions };
	}

	/** GET /packages/:id/schema — an installed package's board or component schema. */
	@Get('packages/:id/schema')
	async getPackageSchema(
		@AuthUser() user: MinimalUser,
		@Param('id') id: string,
	): Promise<GetPackageSchemaOut> {
		const { accountPackage, package: pkg } =
			await this.getPackageUseCase.execute(user.userId, id);
		return {
			id: accountPackage.id!,
			type: pkg.type,
			schema: pkg.schema,
		};
	}

	/** GET /packages/:id — an installed package: its version and package id. */
	@Get('packages/:id')
	async getPackage(
		@AuthUser() user: MinimalUser,
		@Param('id') id: string,
	): Promise<GetPackageOut> {
		const { accountPackage } = await this.getPackageUseCase.execute(
			user.userId,
			id,
		);
		return {
			id: accountPackage.id!,
			version: accountPackage.pkg.version,
			packageId: accountPackage.pkg.id!,
		};
	}

	/** DELETE /packages/:id — removes it; answers the workflows moved to another version and those left without a board. */
	@Delete('packages/:id')
	async deletePackage(
		@AuthUser() user: MinimalUser,
		@Param('id') id: string,
	): Promise<DeletePackageOut> {
		const { moved, detached } = await this.deletePackageUseCase.execute(user.userId, id);
		return { status: 'ok', moved, detached };
	}
}
