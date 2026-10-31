import { Package } from "./Package";

type AccountPackageCreateInput = {
	userId: string;
	pkg: Package;
	token?: string;
};

/**
 * A package a user installed — what shows up in their library, and what their
 * workflows can use. The package itself (a version of it) is shared between
 * users; this is one user's install of it.
 */
export class AccountPackage {
	constructor(
		public readonly id: string | null,
		public readonly userId: string,
		public readonly pkg: Package,
		/** The token to read it from its registry, for a private package; null otherwise. */
		public readonly token: string | null,
	) {}

	/** A new install, not saved yet (no id). */
	public static create(input: AccountPackageCreateInput) {
		return new AccountPackage(
			null,
			input.userId,
			input.pkg,
			input.token ?? null,
		);
	}
}
