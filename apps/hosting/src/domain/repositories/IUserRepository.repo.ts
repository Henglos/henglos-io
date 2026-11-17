import { User } from "../entities/User";
import { Email } from "../value-object/Email";
import { Username } from "../value-object/Username";

/** The user accounts. */
export interface IUserRepository {

	save(user: User): Promise<User>;

	/** Whether any account exists yet — none means the installation still needs its first user. */
	hasUserRegistered(): Promise<boolean>;

	existsById(id: string): Promise<boolean>;

	/** Every account's id. */
	findAllIds(): Promise<string[]>;

	findById(id: string): Promise<User | null>;
	findByEmail(email: Email): Promise<User | null>;
	findByUsername(username: Username): Promise<User | null>;
	/** @param hashedToken The refresh token's hash. */
	findByRefreshToken(hashedToken: string): Promise<User | null>;

	update(user: User): Promise<void>;

	delete(id: string): Promise<void>;

}
