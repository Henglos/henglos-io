import { Inject, Injectable } from "@nestjs/common";

import { User } from "@/domain/entities/User";
import { Email } from "@/domain/value-object/Email";
import { Password } from "@/domain/value-object/Password";
import { Username } from "@/domain/value-object/Username";

import { EmailAlreadyExists, UserAlreadyReigstered, UsernameAlreadyExists } from "@/application/errors/use-cases/Auth.error";

import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { AddPackageUseCase } from "@/application/use-cases/package/AddPackage.use-case";
import { DEFAULT_PACKAGES } from "@/config/default-packages";
import { TelemetryService } from "@/application/services/Telemetry.service";

/**
 * Creates the installation's user — once: a self-hosted installation has a
 * single account, made from the setup page. It starts with the default
 * packages (config/default-packages.json) in its library.
 */
@Injectable()
export class RegisterUserUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		private readonly addPackageUseCase: AddPackageUseCase,
		private readonly telemetry: TelemetryService,
	) {}

	/**
	 * @throws UserAlreadyReigstered when the installation already has its user;
	 *   the value objects' errors for an invalid email, username or password;
	 *   EmailAlreadyExists / UsernameAlreadyExists.
	 */
	async execute(email: string, username: string, password: string) {

		if (await this.userRepository.hasUserRegistered()) throw new UserAlreadyReigstered;

		const _email = Email.create(email);
		const _username = Username.create(username);
		Password.validate(password);

		const hasEmail = await this.userRepository.findByEmail(_email);
		if (hasEmail) throw new EmailAlreadyExists;

		const hasUsername = await this.userRepository.findByUsername(_username);
		if (hasUsername) throw new UsernameAlreadyExists;

		let user = await User.create({
			email: _email.getValue(),
			username: _username.getValue(),
			password: password,
		});

		user = await this.userRepository.save(user);

		await this.installDefaultPackages(user.id!);
		this.telemetry.capture("user_registered");

		return user;

	}

	// One that can't be installed (its registry is down…) is skipped: the account is made anyway.
	private async installDefaultPackages(userId: string): Promise<void> {
		for (const pkg of DEFAULT_PACKAGES) {
			try {
				await this.addPackageUseCase.execute(userId, pkg.spec, pkg.registry, pkg.token);
			} catch (error) {
				console.error(`Failed to install default package ${pkg.name}`, error);
			}
		}
	}

}
