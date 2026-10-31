import { Module } from "@nestjs/common";

import { ServiceModule } from "../services/Service.module";
import { DatabaseModule } from "@/infrastructure/database/Database.module";

import { RegisterUserUseCase } from "./auth/RegisterUser.use-case";
import { LoginUserUseCase } from "./auth/LoginUser.use-case";
import { RefreshTokenUseCase } from "./auth/RefreshToken.use-case";
import { GetSetupStatusUseCase } from "./auth/GetSetupStatus.use-case";
import { DeleteAccountUseCase } from "./account/DeleteAccount.use-case";

import { DeleteDriverUseCase } from "./driver/DeleteDriver.use-case";

import { CreateWorkflowUseCase } from "./workflow/CreateWorkflow.use-case";
import { ListWorkflowsUseCase } from "./workflow/ListWorkflow.use-case";
import { DeleteWorkflowUseCase } from "./workflow/DeleteWorkflow.use-case";

import { ListDriversByUserUseCase } from "./driver/ListDriversByUser.use-case";
import { GetMeAccountUseCase } from "./account/GetMeAccount.use-case";
import { AddPackageUseCase } from "./package/AddPackage.use-case";
import { DeletePackageUseCase } from "./package/DeletePackage.use-case";
import { ListPackagesUseCase } from "./package/ListPackages.use-case";
import { GetPackageUseCase } from "./package/GetPackage.use-case";
import { ListPackageVersionsUseCase } from "./package/ListPackageVersions.use-case";
import { RefreshDriverAuthUseCase } from "./driver/RefreshDriverAuth.use-case";
import { ListPlatformsUseCase } from "./platform/ListPlatforms.use-case";
import { GetPlatformSettingsUseCase } from "./platform/GetPlatformSettings.use-case";
import { UpdateWorkflowUseCase } from "./workflow/UpdateWorkflow.use-case";
import { GetWorkflowUseCase } from "./workflow/GetWorkflow.use-case";
import { ExportWorkflowUseCase } from "./workflow/ExportWorkflow.use-case";
import { ImportWorkflowUseCase } from "./workflow/ImportWorkflow.use-case";
import { WorkflowFilesUseCase } from "./workflow/WorkflowFiles.use-case";
import { DescribeRegistryPackageUseCase } from "./package/DescribeRegistryPackage.use-case";
import { BuildBoardInstall } from "./tasks/BuildBoardInstall";
import { ListDevicesUseCase } from "./driver/ListDevices.use-case";
import { RestartDriverUseCase } from "./driver/RestartDriver.use-case";
import { GetPortStatusUseCase } from "./driver/GetPortStatus.use-case";
import { SyncWorkflowsUseCase } from "./driver/SyncWorkflow.use-case";
import { GenerateDriverPairTokenUseCase } from "./driver/GenerateDriverPairToken.use-case";
import { MakeDriverPairUseCase } from "./driver/MakeDriverPair.use-case";

import { CompileWorkflowTaskUseCase } from "./tasks/CompileWorkflowTask.use-case";
import { FlashWorkflowTaskUseCase } from "./tasks/FlashWorkflowTask.use-case";
import { ExecuteWorkflowTaskUseCase } from "./tasks/ExecuteWorkflowTask.use-case";
import { RunActionTaskUseCase } from "./tasks/RunActionTask.use-case";
import { DebugWorkflowTaskUseCase } from "./tasks/DebugWorkflowTask.use-case";
import { RecordWorkflowTaskUseCase } from "./tasks/RecordWorkflowTask.use-case";
import { StopTaskUseCase } from "./tasks/StopTask.use-case";
import { ReplTaskUseCase } from "./tasks/ReplTask.use-case";
import { BoardFilesTaskUseCase } from "./tasks/BoardFilesTask.use-case";
import { ListCredentialTypesUseCase } from "./credential/ListCredentialTypes.use-case";
import { ListCredentialsUseCase } from "./credential/ListCredentials.use-case";
import { CreateCredentialUseCase } from "./credential/CreateCredential.use-case";
import { UpdateCredentialUseCase } from "./credential/UpdateCredential.use-case";
import { DeleteCredentialUseCase } from "./credential/DeleteCredential.use-case";

/**
 * Every use case — what the hosting does, one class per operation (sign in,
 * create a workflow, compile it…). The controllers and the gateways call
 * them; they reach the database through the repositories and everything
 * else through the services.
 */
@Module({
	imports: [DatabaseModule, ServiceModule],
	providers: [

		GetMeAccountUseCase,
		DeleteAccountUseCase,

		RegisterUserUseCase,
		LoginUserUseCase,
		RefreshTokenUseCase,
		GetSetupStatusUseCase,

		CreateWorkflowUseCase,
		GetWorkflowUseCase,
		ListWorkflowsUseCase,
		UpdateWorkflowUseCase,
		DeleteWorkflowUseCase,
		ExportWorkflowUseCase,
		ImportWorkflowUseCase,
		WorkflowFilesUseCase,

		BuildBoardInstall,
		CompileWorkflowTaskUseCase,
		FlashWorkflowTaskUseCase,
		ExecuteWorkflowTaskUseCase,
		RunActionTaskUseCase,
		DebugWorkflowTaskUseCase,
		RecordWorkflowTaskUseCase,
		StopTaskUseCase,
		ReplTaskUseCase,
		BoardFilesTaskUseCase,
		ListCredentialTypesUseCase,
		ListCredentialsUseCase,
		CreateCredentialUseCase,
		UpdateCredentialUseCase,
		DeleteCredentialUseCase,

		AddPackageUseCase,
		DeletePackageUseCase,
		ListPackagesUseCase,
		GetPackageUseCase,
		ListPackageVersionsUseCase,
		DescribeRegistryPackageUseCase,

		GenerateDriverPairTokenUseCase,
		MakeDriverPairUseCase,
		RefreshDriverAuthUseCase,
		ListDriversByUserUseCase,
		DeleteDriverUseCase,
		ListDevicesUseCase,
		RestartDriverUseCase,
		GetPortStatusUseCase,

		SyncWorkflowsUseCase,

		ListPlatformsUseCase,
		GetPlatformSettingsUseCase,

	],
	exports: [

		GetMeAccountUseCase,
		DeleteAccountUseCase,

		RegisterUserUseCase,
		LoginUserUseCase,
		RefreshTokenUseCase,
		GetSetupStatusUseCase,

		CreateWorkflowUseCase,
		GetWorkflowUseCase,
		ListWorkflowsUseCase,
		UpdateWorkflowUseCase,
		DeleteWorkflowUseCase,
		ExportWorkflowUseCase,
		ImportWorkflowUseCase,
		WorkflowFilesUseCase,

		CompileWorkflowTaskUseCase,
		FlashWorkflowTaskUseCase,
		ExecuteWorkflowTaskUseCase,
		RunActionTaskUseCase,
		DebugWorkflowTaskUseCase,
		RecordWorkflowTaskUseCase,
		StopTaskUseCase,
		ReplTaskUseCase,
		BoardFilesTaskUseCase,
		ListCredentialTypesUseCase,
		ListCredentialsUseCase,
		CreateCredentialUseCase,
		UpdateCredentialUseCase,
		DeleteCredentialUseCase,

		AddPackageUseCase,
		DeletePackageUseCase,
		ListPackagesUseCase,
		GetPackageUseCase,
		ListPackageVersionsUseCase,
		DescribeRegistryPackageUseCase,

		GenerateDriverPairTokenUseCase,
		MakeDriverPairUseCase,
		RefreshDriverAuthUseCase,
		ListDriversByUserUseCase,
		DeleteDriverUseCase,
		ListDevicesUseCase,
		RestartDriverUseCase,
		GetPortStatusUseCase,

		SyncWorkflowsUseCase,

		ListPlatformsUseCase,
		GetPlatformSettingsUseCase,

	]
})
export class UseCaseModule {}
