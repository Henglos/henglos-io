import defaultPackagesConfig from "./default-packages.json";

/** A package every new account starts with in its library. */
export type DefaultPackageEntry = {
	/** Its npm spec, e.g. `@henglosio/board-esp32`. */
	spec: string;
	/** What it's called in logs. */
	name: string;
	/** Its registry — HIO_REGISTRY_URL when not given. */
	registry?: string;
	/** For a private package. */
	token?: string;
};

/**
 * The packages every user gets — default-packages.json: all of them when the
 * account is made, and on the next start one added here later (see
 * SyncDefaultPackagesUseCase). Removing one doesn't uninstall it.
 */
export const DEFAULT_PACKAGES: DefaultPackageEntry[] = defaultPackagesConfig.packages;
