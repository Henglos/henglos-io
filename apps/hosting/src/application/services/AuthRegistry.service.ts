import { type IAuthStrategy } from '@/domain/interfaces/IAuthStrategy.interface';
import { Inject, Injectable } from '@nestjs/common';
import { InvalidAuthStrategy } from '../errors/use-cases/Auth.error';

/**
 * The sign-in strategies, by their `type` — every one provided as
 * "AUTH_STRATEGIES" (see AuthModule).
 */
@Injectable()
export class AuthStrategyRegistry {
	private strategies = new Map<string, IAuthStrategy>();

	constructor(
		@Inject("AUTH_STRATEGIES") strategies: IAuthStrategy[]
	) {
		for (const strategy of strategies) {
			this.strategies.set(strategy.type, strategy);
		}
	}

	/** @throws InvalidAuthStrategy when there's none by that name. */
	get(type: string): IAuthStrategy {
		const strategy = this.strategies.get(type);
		if (!strategy) throw new InvalidAuthStrategy();

		return strategy;
	}
}
