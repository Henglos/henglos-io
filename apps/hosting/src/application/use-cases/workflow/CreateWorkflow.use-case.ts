import { Inject, Injectable } from "@nestjs/common";
import { rsort } from "semver";

import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { type IPackageLinkRepository } from "@/domain/repositories/IPackageLinkRepository.repo";
import { type IAccountPackageRepository } from "@/domain/repositories/IAccountPackageRepository.repo";

import { UserNotFound } from "@/application/errors/User.error";
import { OperationNotPermitted } from "@/application/errors/Auth.error";
import { InvalidPackageType, PackageNotFound } from "@/application/errors/services/Package.error";

import { CreateWorkflow } from "@henglosio/workflow";
import { PLATFORM_PACKAGE } from "@henglosio/shared";
import type { IBoardSchema } from "@henglosio/workflow";
import { Workflow } from "@/domain/entities/Workflow";
import { WorkflowNameAlreadyInUse } from "@/application/errors/Workflow.error";
import { PlatformService } from "@/application/services/Platform.service";
import { PlatformNotFound } from "@/application/errors/services/Platform.error";
import { PackageLink } from "@/domain/entities/PackageLink";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { TelemetryService, packageName } from "@/application/services/Telemetry.service";

/**
 * Creates a workflow on one of the user's boards — and tells their connected
 * drivers which packages it needs, so they get them ready.
 */
@Injectable()
export class CreateWorkflowUseCase {

	private readonly createWorkflow = new CreateWorkflow();

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		@Inject("IPackageLinkRepository") private readonly packageLinkRepository: IPackageLinkRepository,
		@Inject("IAccountPackageRepository") private readonly accountPackageRepository: IAccountPackageRepository,
		private readonly platformService: PlatformService,
		private readonly driverConnectionRegistry: DriverConnectionRegistry,
		private readonly telemetry: TelemetryService,
	) {}

	/**
	 * @param boardId The board's install (AccountPackage) id.
	 * @param platform The platform version — the newest available when not given.
	 * @throws UserNotFound; WorkflowNameAlreadyInUse; PackageNotFound;
	 *   InvalidPackageType when it isn't a board; OperationNotPermitted;
	 *   PlatformNotFound.
	 */
	async execute(userId: string, name: string, description: string, boardId: string, platform?: string) {

		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound;

		if (await this.workflowRepository.existsByName(userId, name))
			throw new WorkflowNameAlreadyInUse;

		const boardAccountPkg = await this.accountPackageRepository.findById(boardId);
		if (!boardAccountPkg) throw new PackageNotFound;
		if (boardAccountPkg.pkg.type !== "board") throw new InvalidPackageType;
		if (boardAccountPkg.userId !== userId) throw new OperationNotPermitted;

		// None given: the newest platform available.
		platform ??= rsort(await this.platformService.list())[0];
		if (!platform) throw new PlatformNotFound("");
		const existsPlatform = await this.platformService.hasVersion(platform);
		if (!existsPlatform) throw new PlatformNotFound(platform);

		const boardLink = PackageLink.fromAccountPackage(boardAccountPkg);
		const savedBoardLink = await this.packageLinkRepository.save(boardLink);

		const workflowData = this.createWorkflow.execute(name, description, boardAccountPkg.pkg.schema as IBoardSchema, boardAccountPkg.id!);
		let workflow = Workflow.create({
			userId,
			data:     workflowData,
			boardId:  savedBoardLink.id!,
			platform,
		});

		workflow = await this.workflowRepository.save(workflow);
		this.telemetry.capture("workflow_created", {
			platform,
			board: packageName(boardAccountPkg.pkg.spec),
			board_version: packageName(boardAccountPkg.pkg.spec) === "third-party" ? null : boardAccountPkg.pkg.version,
		});

		for (const driver of this.driverConnectionRegistry.getAllByUser(userId)) {

			this.driverConnectionRegistry.emit(driver.driverId, "workflow:create", { 
				workflowId: workflow.id!, 
				packages: [
					{
						name: boardAccountPkg.pkg.spec,
						version: boardAccountPkg.pkg.version,
						role: boardAccountPkg.pkg.type
					},
					{
						name: PLATFORM_PACKAGE,
						version: workflow.platform,
						role: "platform"
					}
				]
			});

		}

		return workflow;
	}
}
