import { WrongAuthCredentials } from '@/application/errors/use-cases/Auth.error';
import { User } from '@/domain/entities/User';
import type { IAuthStrategy } from '@/domain/interfaces/IAuthStrategy.interface';
import { type IUserRepository } from '@/domain/repositories/IUserRepository.repo';
import { Email } from '@/domain/value-object/Email';
import { Password } from '@/domain/value-object/Password';
import { Inject, Injectable } from '@nestjs/common';

/** What signing in with "local" takes. */
type LocalAuthInput = {
	email: string;
	password: string;
};

/** Signing in with an email and a password — the "local" strategy. */
@Injectable()
export class LocalAuthStrategy implements IAuthStrategy {
	type: string = 'local';

	constructor(
		@Inject('IUserRepository')
		private readonly userRepository: IUserRepository,
	) {}

	/**
	 * @returns The user with that email, when the password is theirs.
	 * @throws WrongAuthCredentials otherwise — the same error whether the email
	 *   or the password is wrong, so it doesn't tell which accounts exist.
	 */
	async authenticate(input: LocalAuthInput): Promise<User> {

		const _email = Email.create(input.email);

		const user = await this.userRepository.findByEmail(_email);
		if (!user) throw new WrongAuthCredentials;

		const passwordIsValid = await Password.verify(input.password, user.password);
		if (!passwordIsValid) throw new WrongAuthCredentials;

		return user;

	}
}
