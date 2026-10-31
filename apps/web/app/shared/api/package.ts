import type { AddPackageIn, AddPackageOut, DeletePackageOut, PackageListItem, ListPackagesQuery, RegistryPackageOut } from "@henglosio/shared";
import type { PackageSchema } from "@shared/types/package.types";
import { http } from "@shared/lib/http";

export const uploadPackage = async (provider: string, file: File): Promise<string> => {
	const form = new FormData();
	form.append("file", file);
	const { data } = await http.post<{ id: string }>(`/packages/${provider}`, form);
	return data.id;
};

export const addPackage = async (spec: string, registry?: string, token?: string): Promise<string> => {
	const body: AddPackageIn = { spec, registry, token };
	const { data } = await http.post<AddPackageOut>("/packages", body);
	return data.id;
};

/** A package on the registry, by name — its versions newest first, which is "latest", which the account has. */
export const describeRegistryPackage = async (name: string, registry?: string): Promise<RegistryPackageOut> => {
	const { data } = await http.get<RegistryPackageOut>("/packages/registry", { params: { name, registry } });
	return data;
};

export const listPackages = async (filters?: ListPackagesQuery): Promise<PackageListItem[]> => {
	const { data } = await http.get<{ packages: PackageListItem[] }>("/packages", { params: filters });
	return data.packages;
};

export const getPackage = async (packageId: string): Promise<PackageListItem> => {
	const { data } = await http.get<PackageListItem>(`/packages/${packageId}`);
	return data;
};

export const getPackageSchema = async (packageId: string): Promise<PackageSchema> => {
	const { data } = await http.get<PackageSchema>(`/packages/${packageId}/schema`);
	return data;
};

/** Removes a version — a board's workflows move to another version of it, or are left without one. */
export const deletePackage = async (packageId: string): Promise<DeletePackageOut> => {
	const { data } = await http.delete<DeletePackageOut>(`/packages/${packageId}`);
	return data;
};
