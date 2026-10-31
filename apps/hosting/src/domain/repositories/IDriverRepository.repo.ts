import { Driver } from "../entities/Driver";

/** The drivers paired with users' accounts. */
export interface IDriverRepository {

	save(driver: Driver): Promise<Driver>;
	update(driver: Driver): Promise<Driver>;
	findById(id: string): Promise<Driver | null>;
	findAllByUser(userId: string): Promise<Driver[]>;
	/** The driver of a machine, by its hardware id. */
	findByHWID(hardwareHash: string): Promise<Driver | null>;
	/** @param hashedToken The refresh token's hash. */
	findByRefreshToken(hashedToken: string): Promise<Driver | null>;
	delete(id: string): Promise<void>;

}
