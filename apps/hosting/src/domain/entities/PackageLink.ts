import { Package } from "./Package";
import { AccountPackage } from "./AccountPackage";

/**
 * Where a workflow's component comes from: `user` — one the user installed;
 * `native` — one that ships with Henglos IO itself, installed by no one.
 */
export type PackageLinkOrigin = 'user' | 'native';

/**
 * A component used by a workflow. It points to the user's install of it
 * (`accountPackage`) or, for a native one, straight to the package (`pkg`) —
 * exactly one of the two is set.
 */
export class PackageLink {
	constructor(
		public readonly id: string | null,
		public readonly origin: PackageLinkOrigin,
		public readonly pkg: Package | null,
		public readonly accountPackage: AccountPackage | null,
	) {}

	/** A link to a component the user installed. */
	public static fromAccountPackage(accountPackage: AccountPackage): PackageLink {
		return new PackageLink(null, 'user', null, accountPackage);
	}

	/** A link to a native component. */
	public static fromNative(pkg: Package): PackageLink {
		return new PackageLink(null, 'native', pkg, null);
	}
}
