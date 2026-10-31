import { Package } from "../entities/Package";

/** The package versions read from registries — shared by every user who installs them. */
export interface IPackageRepository {
	save(pkg: Package): Promise<Package>;
	findById(id: string): Promise<Package | null>;
	/** @param name The package's npm name (its spec). */
	findByNameVersion(name: string, version: string): Promise<Package | null>;
	/** Every stored version of a package. @param name Its npm name (its spec). */
	findAllByName(name: string): Promise<Package[]>;
}
