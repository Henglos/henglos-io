/**
 * Where the platform's releases come from — a registry, GitHub releases or a
 * local folder (see infrastructure/platform).
 */
export interface IPlatformRepository {
	/** The platform versions available. */
	list(): Promise<string[]>;
	/** A version's package, as a .tgz. @throws PlatformNotFound when there's no such version. */
	fetch(version: string): Promise<Buffer>;
}
