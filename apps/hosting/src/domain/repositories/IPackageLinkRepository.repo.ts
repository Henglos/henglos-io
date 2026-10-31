import { PackageLink } from "../entities/PackageLink";

/** The links from workflows to the components they use. */
export interface IPackageLinkRepository {
	save(link: PackageLink): Promise<PackageLink>;
	findById(id: string): Promise<PackageLink | null>;
	delete(id: string): Promise<void>;
	/** Unties the link from its package — a workflow on it is left without that package. */
	detach(id: string): Promise<void>;
}
