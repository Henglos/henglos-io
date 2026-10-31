import { Module } from "@nestjs/common";
import { LocalAuthStrategy } from "./LocalAuthStrategy.impl";
import { DatabaseModule } from "../database/Database.module";

/**
 * The sign-in strategies, provided together as "AUTH_STRATEGIES" — what
 * AuthStrategyRegistry is built from. A new way to sign in is added here.
 */
@Module({
	imports: [DatabaseModule],
	providers: [
		LocalAuthStrategy,
		{
			provide: "AUTH_STRATEGIES",
			useFactory: (local: LocalAuthStrategy) => [local],
			inject: [LocalAuthStrategy]
		}
	],
	exports: [
		"AUTH_STRATEGIES"
	]
})
export class AuthModule {}
