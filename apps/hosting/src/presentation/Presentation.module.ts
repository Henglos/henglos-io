import { ConsoleLogger, Module } from "@nestjs/common";
import { AuthController } from "./http/auth.controller";
import { UseCaseModule } from "@/application/use-cases/UseCase.module";
import { DriverController } from "./http/driver.controller";
import { PackageController } from "./http/package.controller";
import { WorkflowController } from "./http/workflow.controller";
import { ServiceModule } from "@/application/services/Service.module";
import { AccountController } from "./http/account.controller";
import { DriverWSGateway } from "./ws/driver.gateway";
import { AppWSGateway } from "./ws/app.gateway";
import { DatabaseModule } from "@/infrastructure/database/Database.module";
import { PlatformController } from "./http/platform.controller";
import { CredentialController } from "./http/credential.controller";
import { SystemController } from "./http/system.controller";
import { CollabGateway } from "./collab/Collab.gateway";

/**
 * What the outside reaches: the HTTP controllers (/io/api/v1/…), the
 * studio's and the drivers' sockets (/io/ws) and the collaborative editing
 * (/io/collab).
 */
@Module({
	imports: [DatabaseModule, UseCaseModule, ServiceModule],
	controllers: [
		AccountController,
		AuthController,
		PackageController,
		DriverController,
		WorkflowController,
		PlatformController,
		CredentialController,
		SystemController,
	],
	providers: [AppWSGateway, DriverWSGateway, CollabGateway, ConsoleLogger],
})
export class PresentationModule {}
