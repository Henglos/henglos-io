import zod from "zod";

/** POST /packages — the package to install: its npm spec, registry and token. */
export const AddPackageInSchema = zod.object({
	spec: zod.string(),
	registry: zod.string().optional(),
	token: zod.string().optional(),
});

/** GET /packages/:id/versions — every version its registry has. */
export const ListPackageVersionsOutSchema = zod.object({
	versions: zod.array(zod.string()),
});

// A package as the registry knows it — looked up by name, before (or after)
// it's in the account: every published version, newest first.
export const RegistryPackageQuerySchema = zod.object({
	name: zod.string().min(1),
	registry: zod.string().optional(),
	token: zod.string().optional(),
});

/** GET /packages/registry — a package on its registry: its versions, newest first. */
export const RegistryPackageOutSchema = zod.object({
	name: zod.string(),
	description: zod.string(),
	// The dist-tag "latest" — what installing without a version picks.
	latest: zod.string().nullable(),
	versions: zod.array(zod.object({
		version: zod.string(),
		publishedAt: zod.string().nullable(),
		deprecated: zod.string().nullable(),
		// Already in the account.
		installed: zod.boolean(),
	})),
});

/** GET /packages — search the library by name and/or kind. */
export const ListPackagesQuerySchema = zod.object({
	q: zod.string().optional(),
	type: zod.enum(["board", "component"]).optional(),
});

/** POST /packages — the install's id. */
export const AddPackageOutSchema = zod.object({
	id: zod.string(),
});

/** GET /packages/:id — an installed package: its version and package id. */
export const GetPackageOutSchema = zod.object({
	id: zod.string(),
	packageId: zod.string(),
	version: zod.string(),
});

/** GET /packages/:id/schema — an installed package's board or component schema. */
export const GetPackageSchemaOutSchema = zod.object({
	id: zod.string(),
	type: zod.enum(["board", "component"]),
	schema: zod.unknown(),
});

/** One installed version of a package in the library. */
export const PackageVersionItemSchema = zod.object({
	id: zod.string(),
	version: zod.string(),
	platform: zod.string(),
});

/** A package of the library, with its installed versions. */
export const PackageListItemSchema = zod.object({
	name: zod.string(),
	packageName: zod.string(),
	author: zod.string(),
	description: zod.string(),
	type: zod.enum(["board", "component"]),
	versions: zod.array(PackageVersionItemSchema),
});

/** GET /packages — the library. */
export const ListPackagesOutSchema = zod.object({
	packages: zod.array(PackageListItemSchema),
});

// A board version removed while workflows ran on it: each moved to another
// version of that board (`moved`), or — with none it could use — was left
// without a board (`detached`).
export const DeletePackageOutSchema = zod.object({
	status: zod.literal("ok"),
	moved: zod.array(zod.object({ workflowId: zod.string(), name: zod.string(), version: zod.string() })),
	detached: zod.array(zod.object({ workflowId: zod.string(), name: zod.string() })),
});

/** GET /packages — search the library by name and/or kind. */
export type ListPackagesQuery = zod.infer<typeof ListPackagesQuerySchema>;
/** POST /packages — the package to install: its npm spec, registry and token. */
export type AddPackageIn = zod.infer<typeof AddPackageInSchema>;
/** POST /packages — the install's id. */
export type AddPackageOut = zod.infer<typeof AddPackageOutSchema>;
/** GET /packages/:id/versions — every version its registry has. */
export type ListPackageVersionsOut = zod.infer<
	typeof ListPackageVersionsOutSchema
>;
// A package as the registry knows it — looked up by name, before (or after)
// it's in the account: every published version, newest first.
export type RegistryPackageQuery = zod.infer<typeof RegistryPackageQuerySchema>;
/** GET /packages/registry — a package on its registry: its versions, newest first. */
export type RegistryPackageOut = zod.infer<typeof RegistryPackageOutSchema>;
/** GET /packages/:id — an installed package: its version and package id. */
export type GetPackageOut = zod.infer<typeof GetPackageOutSchema>;
/** GET /packages/:id/schema — an installed package's board or component schema. */
export type GetPackageSchemaOut = zod.infer<typeof GetPackageSchemaOutSchema>;
/** A package of the library, with its installed versions. */
export type PackageListItem = zod.infer<typeof PackageListItemSchema>;
/** GET /packages — the library. */
export type ListPackagesOut = zod.infer<typeof ListPackagesOutSchema>;
// A board version removed while workflows ran on it: each moved to another
// version of that board (`moved`), or — with none it could use — was left
// without a board (`detached`).
export type DeletePackageOut = zod.infer<typeof DeletePackageOutSchema>;
