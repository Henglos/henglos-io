import { Injectable } from "@nestjs/common";
import { User } from "@/domain/entities/User";
import { AuthStrategyRegistry } from "./AuthRegistry.service";

/** Signs users in, through whichever strategy they use (see IAuthStrategy). */
@Injectable()
export class AuthService {

	constructor(
		private readonly strategyRegistry: AuthStrategyRegistry,
	) {}

	/**
	 * @param type The strategy, e.g. "local".
	 * @param input What it expects to sign in with.
	 * @returns The user it belongs to.
	 * @throws InvalidAuthStrategy for an unknown strategy, or the strategy's own error.
	 */
	async authenticate(type: string, input: unknown): Promise<User> {

		const strategy = this.strategyRegistry.get(type);
		return await strategy.authenticate(input);

	}

}
