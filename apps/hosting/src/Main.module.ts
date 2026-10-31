import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { InfrastructureModule } from "./infrastructure/Infrastructure.module";
import { UseCaseModule } from "./application/use-cases/UseCase.module";
import { PresentationModule } from "./presentation/Presentation.module";
import { DatabaseModule } from "./infrastructure/database/Database.module";
import { EnvSchema } from "./config/env.schema";

/**
 * The hosting as a whole: its settings (validated by EnvSchema, available
 * everywhere), the scheduled jobs, and its layers — infrastructure, use
 * cases, presentation.
 */
@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			validate: (raw) => EnvSchema.parse(raw)
		}),
		ScheduleModule.forRoot(),
		DatabaseModule,
		InfrastructureModule,
		UseCaseModule,
		PresentationModule
	]
})
export class MainModule {}
