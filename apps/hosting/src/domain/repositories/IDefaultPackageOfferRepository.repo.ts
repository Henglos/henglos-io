/**
 * Which default packages (config/default-packages.json) each user was already
 * offered, by package name — so one added to the list later gets installed,
 * and one the user removed isn't installed again.
 */
export interface IDefaultPackageOfferRepository {
	/** The names of the default packages the user was offered. */
	findNamesByUser(userId: string): Promise<string[]>;
	/** Records that the user was offered it — again is a no-op. */
	save(userId: string, name: string): Promise<void>;
}
