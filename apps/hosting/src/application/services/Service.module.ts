import { Module } from "@nestjs/common";
import { AuthService } from "./Auth.service";
import { DatabaseModule } from "@/infrastructure/database/Database.module";
import { AuthStrategyRegistry } from "./AuthRegistry.service";
import { AuthModule } from "@/infrastructure/auth/Auth.module";
import { DriverAuthService } from "./DriverAuth.service";
import { DriverConnectionRegistry } from "./DriverConnectionRegistry.service";
import { TaskRegistry } from "./TaskRegistry.service";
import { TokenService } from "./Token.service";
import { PlatformService } from "./Platform.service";
import { PlatformModule } from "@/infrastructure/platform/Platform.module";
import { DriverPairTokenCleanupService } from "./DriverPairTokenCleanup.service";
import { PackageRegistryService } from "./PackageRegistry.service";
import { LocalPackagesService } from "./LocalPackages.service";
import { WorkflowCollabService } from "./WorkflowCollab.service";
import { SecretBox } from "./SecretBox.service";
import { CredentialService } from "./Credential.service";
import { TelemetryService } from "./Telemetry.service";
import { BoardFilesTaskService } from "./BoardFilesTask.service";
import { DebugSessionsService } from "./DebugSessions.service";
import { WorkflowPackagesService } from "./WorkflowPackages.service";

/**
 * The application's services — what the use cases, the gateways and the
 * controllers share: tokens, the connected drivers, the running tasks, the
 * package registry, the collaborative editing, the secrets, the telemetry.
 */
@Module({
	imports: [DatabaseModule, AuthModule, PlatformModule],
	providers: [
		AuthStrategyRegistry,
		AuthService,
		DriverAuthService,
		DriverConnectionRegistry,
		TaskRegistry,
		TokenService,
		PlatformService,
		DriverPairTokenCleanupService,
		LocalPackagesService,
		PackageRegistryService,
		WorkflowCollabService,
		SecretBox,
		CredentialService,
		TelemetryService,
		BoardFilesTaskService,
		DebugSessionsService,
		WorkflowPackagesService,
	],
	exports: [
		AuthStrategyRegistry,
		AuthService,
		DriverAuthService,
		DriverConnectionRegistry,
		TaskRegistry,
		TokenService,
		PlatformService,
		DriverPairTokenCleanupService,
		PackageRegistryService,
		WorkflowCollabService,
		SecretBox,
		CredentialService,
		TelemetryService,
		BoardFilesTaskService,
		DebugSessionsService,
		WorkflowPackagesService,
	]
})
export class ServiceModule {}
