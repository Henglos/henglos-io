import type { IUserRepository } from '@/domain/repositories/IUserRepository.repo';
import { SqliteConnection } from './SqliteConnection';
import { User } from '@/domain/entities/User';
import { Email } from '@/domain/value-object/Email';
import { Username } from '@/domain/value-object/Username';
import { Password } from '@/domain/value-object/Password';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from './schema';

/** IUserRepository on SQLite: the `users` table. */
@Injectable()
export class UserSqliteRepo implements IUserRepository {

	constructor(private readonly database: SqliteConnection) {}

	// A row back to a User — the stored password is its hash, kept as it is.
	private toDomain(row: typeof users.$inferSelect): User {
		return new User(
			row.id,
			Email.create(row.email),
			Username.create(row.username),
			new Password(row.password),
			row.createdAt,
			row.updatedAt,
			row.refreshToken ?? null,
			row.refreshTokenExpiresAt ?? null,
		);
	}

	async save(user: User): Promise<User> {

		const [_user] = await this.database.connection((db) => db.insert(users).values({
			username: user.username.getValue(),
			email: user.email.getValue(),
			password: user.password.getValue(),
		}).returning());

		return this.toDomain(_user);

	}

	async hasUserRegistered(): Promise<boolean> {

		const [user] = await this.database.connection((db) => db.select({ id: users.id }).from(users).limit(1));
		return !!user;
	}

	async findAllIds(): Promise<string[]> {

		const rows = await this.database.connection((db) => db.select({ id: users.id }).from(users));
		return rows.map((row) => row.id);
	}

	async existsById(id: string): Promise<boolean> {

		const rows = await this.database.connection((db) => db.select({ id: users.id }).from(users).where(eq(users.id, id)));
		return rows.length > 0;

	}

	async findById(id: string): Promise<User | null> {

		const row = await this.database.connection((db) => db.query.users.findFirst({ where: eq(users.id, id) }));
		return row ? this.toDomain(row) : null;

	}

	async findByEmail(email: Email): Promise<User | null> {

		const row = await this.database.connection((db) => db.query.users.findFirst({ where: eq(users.email, email.getValue()) }));
		return row ? this.toDomain(row) : null;

	}

	async findByUsername(username: Username): Promise<User | null> {

		const row = await this.database.connection((db) => db.query.users.findFirst({ where: eq(users.username, username.getValue()) }));
		return row ? this.toDomain(row) : null;

	}

	async findByRefreshToken(hashedToken: string): Promise<User | null> {

		const row = await this.database.connection((db) => db.query.users.findFirst({ where: eq(users.refreshToken, hashedToken) }));
		return row ? this.toDomain(row) : null;

	}

	async update(user: User): Promise<void> {

		await this.database.connection((db) => db.update(users).set({
			username: user.username.getValue(),
			email: user.email.getValue(),
			password: user.password.getValue(),
			updatedAt: user.updatedAt,
			refreshToken: user.refreshToken,
			refreshTokenExpiresAt: user.refreshTokenExpiresAt,
		}).where(eq(users.id, user.id!)));

	}

	async delete(id: string): Promise<void> {

		await this.database.connection((db) => db.delete(users).where(eq(users.id, id)));

	}

}
