import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { InfrastructureModule } from "./infrastructure/Infrastructure.module";
import { UseCaseModule } from "./application/use-cases/UseCase.module";
import { PresentationModule } from "./presentation/Presentation.module";
import { DatabaseModule } from "./infrastructure/database/Database.module";
import { EnvSchema, type Env } from "./config/env.schema";
import { RATE_LIMIT_WINDOW, RateLimitGuard } from "./infrastructure/http/guards/RateLimit.guard";

/**
 * The hosting as a whole: its settings (validated by EnvSchema, available
 * everywhere), the scheduled jobs, the API's rate limit (RateLimitGuard, on
 * every route), and its layers — infrastructure, use cases, presentation.
 */
@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			validate: (raw) => EnvSchema.parse(raw)
		}),
		ScheduleModule.forRoot(),
		ThrottlerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService<Env, true>) => {
				const limit = config.get("HIO_RATE_LIMIT", { infer: true });
				return {
					throttlers: [{ name: "default", ttl: RATE_LIMIT_WINDOW, limit }],
					// 0: off — the routes' own tighter limits included.
					skipIf: () => limit === 0,
				};
			},
		}),
		DatabaseModule,
		InfrastructureModule,
		UseCaseModule,
		PresentationModule
	],
	providers: [
		{ provide: APP_GUARD, useClass: RateLimitGuard },
	],
})
export class MainModule {}
