import { Module } from "@nestjs/common";
import { LocalAuthStrategy } from "./auth/LocalAuthStrategy.impl";
import { DatabaseModule } from "./database/Database.module";
import { AuthModule } from "./auth/Auth.module";

/**
 * The hosting's adapters to the outside: the database and the sign-in
 * strategies. HTTP's guards, decorators and pipes (./http) are used where
 * they're needed — AuthGuard isn't global: each route that needs a signed-in
 * user says so with @UseGuards.
 */
@Module({
	imports: [DatabaseModule, AuthModule],
	providers: [
		LocalAuthStrategy
	],
	exports: [
		LocalAuthStrategy
	],
})
export class InfrastructureModule {}
