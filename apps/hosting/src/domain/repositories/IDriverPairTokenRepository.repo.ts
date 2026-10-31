import { DriverPairToken } from "../entities/DriverPairToken";

/** The pair tokens waiting for a driver to use them. */
export interface IDriverPairTokenRepository {

	save(driverPair: DriverPairToken): Promise<DriverPairToken>;
	/** @param token The token, as the user passed it. */
	findByPairToken(token: string): Promise<DriverPairToken | null>;
	/** @returns Whether there was one to delete. */
	delete(id: string): Promise<boolean>;
	/** Deletes every expired token. @returns How many were deleted. */
	deleteExpired(): Promise<number>;

}
