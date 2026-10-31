import type { IBoardSchema, IComponentSchema } from "@henglosio/workflow";
import type { PackageListItem, GetPackageSchemaOut } from "@henglosio/shared";

export type BasePackage = {

	id: string;
	name: string;
	version: string;
	platform: string;

}

export type PackageSchema = Omit<GetPackageSchemaOut, "schema"> & {
	schema: IComponentSchema | IBoardSchema;
};

export type PackageGroup = {
	name: string;
	author: string;
	description: string;
	versions: PackageListItem[];
};
