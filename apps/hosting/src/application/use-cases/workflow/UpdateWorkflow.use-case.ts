import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type IBoardSchema, type IComponentSchema, type IWorkflowRuntime, AddComponentToWorkflow, RemoveComponentFromWorkflow, AddActionToWorkflowComponent, RemoveActionFromWorkflowComponent, UpdateWorkflowActionConfiguration, BindWorkflowActionConfigurationOutput, SetWorkflowActionConfigurationCode, SetWorkflowActionNotes, SetWorkflowActionDisabled, SetWorkflowActionPassContext, AddSwitchCase, RemoveSwitchCase, SetPlatformSetting, SetBoardOption, AddWorkflowVariable, UpdateWorkflowVariable, RemoveWorkflowVariable, BindWorkflowActionConfigurationVariable } from '@henglosio/workflow';
import { CreateBoard, findAddableComponent, findNodeSchema } from '@henglosio/workflow';
import { hmutate } from 'hmutate';
import {
	UpdateWorkflowMetadataOperationSchema,
	ChangeBoardOperationSchema,
	ChangePlatformOperationSchema,
	SetPlatformSettingOperationSchema,
	SetBoardOptionOperationSchema,
	AddComponentOperationSchema,
	RemoveComponentOperationSchema,
	AddActionOperationSchema,
	RemoveActionOperationSchema,
	AddConnectionOperationSchema,
	RemoveConnectionOperationSchema,
	UpdateActionConfigurationOperationSchema,
	BindActionConfigurationOutputOperationSchema,
	SetActionConfigurationCodeOperationSchema,
	SetActionNotesOperationSchema,
	SetActionDisabledOperationSchema,
	SetActionPassContextOperationSchema,
	AddSwitchCaseOperationSchema,
	RemoveSwitchCaseOperationSchema,
	AddVariableOperationSchema,
	UpdateVariableOperationSchema,
	RemoveVariableOperationSchema,
	BindActionConfigurationVariableOperationSchema,
	type UpdateWorkflowIn,
} from '@henglosio/shared';

import { type IUserRepository } from '@/domain/repositories/IUserRepository.repo';
import { type IWorkflowRepository } from '@/domain/repositories/IWorkflowRepository.repo';
import { type IAccountPackageRepository } from '@/domain/repositories/IAccountPackageRepository.repo';
import { type IPackageLinkRepository } from '@/domain/repositories/IPackageLinkRepository.repo';

import { UserNotFound } from '@/application/errors/User.error';
import { OperationNotPermitted } from '@/application/errors/Auth.error';
import { WorkflowNotFound, ActionNotFound, WorkflowNameAlreadyInUse } from '@/application/errors/Workflow.error';
import { PackageLink } from '@/domain/entities/PackageLink';
import type { AccountPackage } from '@/domain/entities/AccountPackage';
import {
	InvalidPackageType,
	PackageNotFound,
	IncompatiblePlatformVersion,
} from '@/application/errors/services/Package.error';
import { PlatformNotFound } from '@/application/errors/services/Platform.error';
import { DriverConnectionRegistry } from '@/application/services/DriverConnectionRegistry.service';
import { PlatformService } from '@/application/services/Platform.service';
import semver from 'semver';
import { WorkflowCollabService } from '@/application/services/WorkflowCollab.service';
import { WorkflowPackagesService } from '@/application/services/WorkflowPackages.service';
import { TelemetryService, packageName } from "@/application/services/Telemetry.service";

type UpdateWorkflowInput = UpdateWorkflowIn;

/**
 * Every change to a workflow made through the HTTP API: a patch of
 * operations (rename, add an action, connect two, change the board, add a
 * component, set a config…), applied in order with @henglosio/workflow's use
 * cases. When the workflow is open in the studio, the patch is applied to its
 * live collaborative doc and merged into it, so concurrent edits survive.
 */
@Injectable()
export class UpdateWorkflowUseCase {
	private readonly createBoard = new CreateBoard();
	private readonly addComponentToWorkflow = new AddComponentToWorkflow();
	private readonly removeComponentFromWorkflow = new RemoveComponentFromWorkflow();
	private readonly addActionToWorkflowComponent = new AddActionToWorkflowComponent();
	private readonly removeActionFromWorkflowComponent = new RemoveActionFromWorkflowComponent();
	private readonly updateWorkflowActionConfiguration = new UpdateWorkflowActionConfiguration();
	private readonly bindWorkflowActionConfigurationOutput = new BindWorkflowActionConfigurationOutput();
	private readonly setWorkflowActionConfigurationCode = new SetWorkflowActionConfigurationCode();
	private readonly setWorkflowActionNotes = new SetWorkflowActionNotes();
	private readonly setWorkflowActionDisabled = new SetWorkflowActionDisabled();
	private readonly setWorkflowActionPassContext = new SetWorkflowActionPassContext();
	private readonly addSwitchCase = new AddSwitchCase();
	private readonly removeSwitchCase = new RemoveSwitchCase();
	private readonly setPlatformSetting = new SetPlatformSetting();
	private readonly setBoardOption = new SetBoardOption();
	private readonly addWorkflowVariable = new AddWorkflowVariable();
	private readonly updateWorkflowVariable = new UpdateWorkflowVariable();
	private readonly removeWorkflowVariable = new RemoveWorkflowVariable();
	private readonly bindWorkflowActionConfigurationVariable = new BindWorkflowActionConfigurationVariable();

	constructor(
		private readonly driverConnectionRegistry: DriverConnectionRegistry,
		private readonly platformService: PlatformService,
		private readonly collab: WorkflowCollabService,
		@Inject('IUserRepository')
		private readonly userRepository: IUserRepository,
		@Inject('IWorkflowRepository')
		private readonly workflowRepository: IWorkflowRepository,
		@Inject('IAccountPackageRepository')
		private readonly accountPackageRepository: IAccountPackageRepository,
		@Inject('IPackageLinkRepository')
		private readonly packageLinkRepository: IPackageLinkRepository,
		private readonly telemetry: TelemetryService,
		private readonly workflowPackages: WorkflowPackagesService,
	) {}

	// `board.packageId`/component `packageId` should always be an AccountPackage id, but
	// some workflows (created before this was fixed) may have a PackageLink id stored
	// instead — fall back to resolving through the link so those still sync correctly.
	private async resolveAccountPackage(id: string) {
		const direct = await this.accountPackageRepository.findById(id);
		if (direct) return direct;

		const link = await this.packageLinkRepository.findById(id);
		return link?.accountPackage ?? null;
	}

	// The version must be published, and inside the platform range every
	// package of the workflow declares (its manifest's dependences.platform) —
	// otherwise the board would run components built against another runtime.
	private async assertPlatformSupported(version: string, data: IWorkflowRuntime): Promise<void> {
		const available = await this.platformService.list();
		if (!available.includes(version)) throw new PlatformNotFound(version);

		const packageIds = [data.board.packageId, ...new Set(data.components.map(c => c.packageId))];
		const packages = await Promise.all(packageIds.map(id => this.resolveAccountPackage(id)));

		for (const accountPackage of packages) {
			const range = accountPackage?.pkg?.platform;
			if (range && !semver.satisfies(version, range)) throw new IncompatiblePlatformVersion;
		}
	}

	/**
	 * @param updates.patch The operations, applied in order — all or nothing.
	 * @throws UserNotFound, WorkflowNotFound; OperationNotPermitted when it
	 *   isn't the user's; the operations' own errors (a name in use, a package
	 *   not found, an incompatible platform…).
	 */
	async execute(
		userId: string,
		workflowId: string,
		updates: UpdateWorkflowInput,
	) {
		const user = await this.userRepository.findById(userId);
		if (!user) throw new UserNotFound();

		const workflow = await this.workflowRepository.findById(workflowId);
		if (!workflow) throw new WorkflowNotFound();
		if (workflow.userId !== userId) throw new OperationNotPermitted();

		let shouldSyncDrivers = false;

		// If the workflow is open in the studio, its live collab doc is ahead of
		// the stored JSON — mutate that instead, and merge the result back below.
		const snapshot = this.collab.snapshot(workflow.id!);
		const mutate = hmutate(snapshot?.data ?? workflow.data, updates.patch);

		// Note: use `ctx.target`, not `ctx.document` — hmutate keeps
		// `ctx.document` pointing at the ORIGINAL document (from before any of
		// the patch's operations), while `ctx.target` is the document already
		// updated by the earlier operations of the same request. With a
		// one-operation patch it never made a difference (document == target),
		// but with several operations in the same patch (e.g. removing a
		// connection and creating two new ones) `ctx.document` makes each
		// operation rebuild from the original state, dropping what the earlier
		// ones did.

		mutate.operator(UpdateWorkflowMetadataOperationSchema, async (ctx) => {
			const current = ctx.target as unknown as IWorkflowRuntime;
			const { name, description } = ctx.patch;
			// Names are unique per user (see CreateWorkflow) — keeping its own is fine.
			if (name !== undefined && name !== current.name && await this.workflowRepository.existsByName(userId, name)) {
				throw new WorkflowNameAlreadyInUse();
			}
			return {
				...current,
				...(name !== undefined && { name }),
				...(description !== undefined && { description }),
			} as unknown;
		});

		// The board's package, linked to the workflow after the patch — see below.
		let boardChange: AccountPackage | null = null;

		mutate.operator(ChangeBoardOperationSchema, async (ctx) => {
			const accountPkg = await this.accountPackageRepository.findById(
				ctx.patch.packageId,
			);
			if (!accountPkg) throw new PackageNotFound();
			if (accountPkg.userId !== userId) throw new OperationNotPermitted();

			const pkg = accountPkg.pkg;
			if (!pkg) throw new PackageNotFound();
			if (pkg.type !== 'board') throw new InvalidPackageType();

			boardChange = accountPkg;

			const boardRuntime = this.createBoard.execute(
				pkg.schema as IBoardSchema,
				accountPkg.id!,
			);

			shouldSyncDrivers = true;

			const currentRuntime = ctx.target as unknown as IWorkflowRuntime;
			const board = packageName(pkg.spec);
			this.telemetry.capture("board_changed", { board, board_version: board === "third-party" ? null : pkg.version });
			return { ...currentRuntime, board: boardRuntime } as unknown;
		});

		mutate.operator(AddComponentOperationSchema, async (ctx) => {
			const accountPkg = await this.accountPackageRepository.findById(
				ctx.patch.packageId,
			);
			if (!accountPkg) throw new PackageNotFound();

			const pkg = accountPkg.pkg;
			if (!pkg) throw new PackageNotFound();
			if (pkg.type !== 'component') throw new InvalidPackageType();

			const { workflow: updatedRuntime } = this.addComponentToWorkflow.execute(
				ctx.target as unknown as IWorkflowRuntime,
				pkg.schema as IComponentSchema,
				accountPkg.id!,
			);

			shouldSyncDrivers = true;
			const name = packageName(pkg.spec);
			this.telemetry.capture("component_added", { package: name, version: name === "third-party" ? null : pkg.version });

			return updatedRuntime as unknown;
		});

		mutate.operator(RemoveComponentOperationSchema, async (ctx) => {
			const currentRuntime = ctx.target as unknown as IWorkflowRuntime;
			const removedComponent = currentRuntime.components.find(c => c.id === ctx.patch.componentId);

			const { workflow: updatedRuntime } = this.removeComponentFromWorkflow.execute(
				currentRuntime,
				ctx.patch.componentId,
			);

			if (removedComponent && !updatedRuntime.components.some(c => c.packageId === removedComponent.packageId)) {
				shouldSyncDrivers = true;
			}

			return updatedRuntime as unknown;
		});

		mutate.operator(AddActionOperationSchema, async (ctx) => {
			const currentRuntime = ctx.target as unknown as IWorkflowRuntime;
			// The built-in Logic component is offered before it's in the workflow.
			const component = findAddableComponent(currentRuntime, ctx.patch.componentId);
			if (!component) return ctx.target;

			// An action of it, or one of its triggers.
			const actionSchema = findNodeSchema(component, ctx.patch.actionName);
			if (!actionSchema) throw new ActionNotFound();

			const { workflow: updatedRuntime } = this.addActionToWorkflowComponent.execute(
				currentRuntime,
				ctx.patch.componentId,
				actionSchema,
			);

			return updatedRuntime as unknown;
		});

		mutate.operator(BindActionConfigurationOutputOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			const updated = this.bindWorkflowActionConfigurationOutput.execute(
				runtime,
				ctx.patch.componentId,
				ctx.patch.actionId,
				ctx.patch.configurationId,
				ctx.patch.sourceActionId,
				ctx.patch.outputName,
			);
			return updated as unknown;
		});

		mutate.operator(SetActionConfigurationCodeOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			const updated = this.setWorkflowActionConfigurationCode.execute(
				runtime,
				ctx.patch.componentId,
				ctx.patch.actionId,
				ctx.patch.configurationId,
				ctx.patch.code,
			);
			return updated as unknown;
		});

		mutate.operator(SetActionNotesOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			const updated = this.setWorkflowActionNotes.execute(
				runtime,
				ctx.patch.componentId,
				ctx.patch.actionId,
				ctx.patch.notes,
			);
			return updated as unknown;
		});

		mutate.operator(SetActionDisabledOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			return this.setWorkflowActionDisabled.execute(
				runtime,
				ctx.patch.componentId,
				ctx.patch.actionId,
				ctx.patch.disabled,
			) as unknown;
		});

		mutate.operator(SetActionPassContextOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			return this.setWorkflowActionPassContext.execute(
				runtime,
				ctx.patch.componentId,
				ctx.patch.actionId,
				ctx.patch.passContext,
			) as unknown;
		});

		mutate.operator(AddSwitchCaseOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			return this.addSwitchCase.execute(runtime, ctx.patch.componentId, ctx.patch.actionId) as unknown;
		});

		mutate.operator(RemoveSwitchCaseOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			return this.removeSwitchCase.execute(runtime, ctx.patch.componentId, ctx.patch.actionId, ctx.patch.case) as unknown;
		});

		mutate.operator(SetPlatformSettingOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			return this.setPlatformSetting.execute(runtime, ctx.patch.key, ctx.patch.value) as unknown;
		});

		mutate.operator(SetBoardOptionOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			return this.setBoardOption.execute(runtime, ctx.patch.key, ctx.patch.value) as unknown;
		});

		mutate.operator(AddVariableOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			return this.addWorkflowVariable.execute(runtime, ctx.patch.variable).workflow as unknown;
		});

		mutate.operator(UpdateVariableOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			const { name, type, initial, shape } = ctx.patch;
			return this.updateWorkflowVariable.execute(runtime, ctx.patch.variableId, { name, type, initial, shape }) as unknown;
		});

		mutate.operator(RemoveVariableOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			return this.removeWorkflowVariable.execute(runtime, ctx.patch.variableId) as unknown;
		});

		mutate.operator(BindActionConfigurationVariableOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			return this.bindWorkflowActionConfigurationVariable.execute(
				runtime,
				ctx.patch.componentId,
				ctx.patch.actionId,
				ctx.patch.configurationId,
				ctx.patch.variableId,
			) as unknown;
		});

		mutate.operator(RemoveActionOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			const { workflow: updated } = this.removeActionFromWorkflowComponent.execute(
				runtime,
				ctx.patch.componentId,
				ctx.patch.actionId,
			);
			return updated as unknown;
		});

		mutate.operator(UpdateActionConfigurationOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			const updated = this.updateWorkflowActionConfiguration.execute(
				runtime,
				ctx.patch.componentId,
				ctx.patch.actionId,
				ctx.patch.configurationId,
				ctx.patch.value,
			);
			return updated as unknown;
		});

		mutate.operator(AddConnectionOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			const connections = runtime.connections ?? [];

			// Idempotent by connection id: the client generates the id up front
			// (onConnect/autosave send the same object it already put in local
			// state) and can end up submitting the same add:connection patch more
			// than once — a retried request, or two overlapping saves both
			// diffing against a not-yet-updated savedCanvas. Appending
			// unconditionally would silently persist the same connection twice,
			// which then makes every consumer keyed on connection.id (the studio
			// canvas, GenerateExecuteCommand's output-entry resolution) trip over
			// a duplicate id — see RemoveConnectionOperationSchema below, which is
			// naturally idempotent via filter() and never had this problem.
			if (connections.some(c => c.id === ctx.patch.connection.id)) {
				return runtime as unknown;
			}

			return {
				...runtime,
				connections: [...connections, ctx.patch.connection],
			} as unknown;
		});

		mutate.operator(RemoveConnectionOperationSchema, (ctx) => {
			const runtime = ctx.target as unknown as IWorkflowRuntime;
			return {
				...runtime,
				connections: runtime.connections.filter(c => c.id !== ctx.patch.connectionId),
			} as unknown;
		});

		// change:platform touches the Workflow entity, not `data` — the operator
		// only records the version; it's checked and applied after the patch,
		// against the board and components the patch left the workflow with.
		let platformChange: string | null = null;
		mutate.operator(ChangePlatformOperationSchema, (ctx) => {
			platformChange = ctx.patch.version;
			return ctx.target;
		});

		const patched = await mutate.patchAsync();

		if (platformChange !== null && platformChange !== workflow.platform) {
			await this.assertPlatformSupported(platformChange, patched as IWorkflowRuntime);
			workflow.platform = platformChange;
			shouldSyncDrivers = true;
		}

		// A new board must build against the workflow's platform, and gets its
		// own link: GetWorkflow reads the board's schema through `boardId`, so
		// without it the old board would keep showing.
		const newBoard = boardChange as AccountPackage | null;
		let replacedBoardLink: string | null = null;
		if (newBoard) {
			const range = newBoard.pkg.platform;
			if (range && !semver.satisfies(workflow.platform, range)) throw new IncompatiblePlatformVersion;
			const link = await this.packageLinkRepository.save(PackageLink.fromAccountPackage(newBoard));
			replacedBoardLink = workflow.boardId;
			workflow.boardId = link.id!;
		}
		const merged = snapshot ? await this.collab.merge(workflow.id!, snapshot, patched) : null;
		const data = merged ?? patched;
		workflow.updateData(data);

		await this.workflowRepository.update(workflow);

		// The old board's link was this workflow's alone.
		if (replacedBoardLink && replacedBoardLink !== workflow.boardId && !await this.workflowRepository.isPackageInUse(replacedBoardLink)) {
			await this.packageLinkRepository.delete(replacedBoardLink).catch(() => {});
		}

		if (shouldSyncDrivers) {
			const drivers = this.driverConnectionRegistry.getAllByUser(userId);

			const packages = await this.workflowPackages.packagesOf(workflow);

			for (const driver of drivers) {
				this.driverConnectionRegistry.emit(driver.driverId, 'workflow:sync', {
					id: randomUUID(),
					workflowId: workflow.id,
					packages,
				});
			}
		}

		return workflow;

	}
}
