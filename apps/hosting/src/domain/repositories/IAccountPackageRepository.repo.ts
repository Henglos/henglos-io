import { AccountPackage } from "../entities/AccountPackage";

/** How a user's library can be narrowed down. */
export type AccountPackageFilters = {
	/** Text to search the package's name for. */
	q?:    string;
	type?: "board" | "component";
};

/** The packages users installed — their libraries. */
export interface IAccountPackageRepository {
	save(pkg: AccountPackage): Promise<AccountPackage>;
	findById(id: string): Promise<AccountPackage | null>;
	/** A user's install of a package version, if they installed it. */
	findByUserPackage(userId: string, packageId: string): Promise<AccountPackage | null>;
	/** A user's library. */
	findAllByUser(userId: string, filters?: AccountPackageFilters): Promise<AccountPackage[]>;
	/** The workflows that run on it as their board. */
	findBoardWorkflowIds(id: string): Promise<string[]>;
	/** Whether a workflow uses it as one of its components. */
	isUsedAsComponent(id: string): Promise<boolean>;
	/** Removes it with its links — move or detach the workflows on it first. */
	delete(id: string): Promise<void>;
}
