import { createHash } from "crypto";
import { Inject, Injectable } from "@nestjs/common";
import semver from "semver";
import {
	HIO_FILES_DIR,
	HIO_FORMAT_VERSION,
	HIO_MANIFEST_FILE,
	HIO_MAX_BYTES,
	HIO_WORKFLOW_FILE,
	HioManifestSchema,
	PLATFORM_PACKAGE,
	type HioPackageRef,
	type ImportWorkflowOut,
} from "@henglosio/shared";
import { LOGIC_PACKAGE_ID, LogicComponentSchema, mapWorkflowCredentialValues, migrateLegacyLogic, mapWorkflowFileValues, VARIABLES_PACKAGE_ID, VariablesComponentSchema, workflowCredentialIds, workflowFileValues, WorkflowRuntime, type IBoardSchema, type IComponentSchema } from "@henglosio/workflow";
import { CredentialService } from "@/application/services/Credential.service";
import { type IWorkflowFileRepository } from "@/domain/repositories/IWorkflowFileRepository.repo";
import { WORKFLOW_FILE_MAX_BYTES } from "@/domain/entities/WorkflowFile";

import { Workflow } from "@/domain/entities/Workflow";
import { PackageLink } from "@/domain/entities/PackageLink";
import type { AccountPackage } from "@/domain/entities/AccountPackage";
import { type IUserRepository } from "@/domain/repositories/IUserRepository.repo";
import { type IWorkflowRepository } from "@/domain/repositories/IWorkflowRepository.repo";
import { type IPackageRepository } from "@/domain/repositories/IPackageRepository.repo";
import { type IAccountPackageRepository } from "@/domain/repositories/IAccountPackageRepository.repo";
import { type IPackageLinkRepository } from "@/domain/repositories/IPackageLinkRepository.repo";
import { PlatformService } from "@/application/services/Platform.service";
import { DriverConnectionRegistry } from "@/application/services/DriverConnectionRegistry.service";
import { UserNotFound } from "@/application/errors/User.error";
import { ImportPackageFailed, InvalidWorkflowArchive } from "@/application/errors/Workflow.error";
import { PlatformNotFound } from "@/application/errors/services/Platform.error";
import { AddPackageUseCase } from "@/application/use-cases/package/AddPackage.use-case";
import { strFromU8, unzipSync } from "fflate";
import { TelemetryService } from "@/application/services/Telemetry.service";

/**
 * A .hio back into a workflow of the account: installs the packages it lists
 * (the board and the components, at their exact versions, from their
 * registries) unless the account has them already, puts their schemas back
 * into the data, and creates the workflow — renamed if the name is taken.
 */
@Injectable()
export class ImportWorkflowUseCase {

	constructor(
		@Inject("IUserRepository") private readonly userRepository: IUserRepository,
		@Inject("IWorkflowRepository") private readonly workflowRepository: IWorkflowRepository,
		@Inject("IPackageRepository") private readonly packageRepository: IPackageRepository,
		@Inject("IAccountPackageRepository") private readonly accountPackageRepository: IAccountPackageRepository,
		@Inject("IPackageLinkRepository") private readonly packageLinkRepository: IPackageLinkRepository,
		@Inject("IWorkflowFileRepository") private readonly fileRepository: IWorkflowFileRepository,
		private readonly addPackageUseCase: AddPackageUseCase,
		private readonly platformService: PlatformService,
		private readonly driverConnectionRegistry: DriverConnectionRegistry,
		private readonly credentials: CredentialService,
		private readonly telemetry: TelemetryService,
	) {}

	/**
	 * @param file The .hio archive's bytes.
	 * @throws InvalidWorkflowArchive when it can't be read; ImportPackageFailed
	 *   when a package it needs can't be installed.
	 */
	async execute(userId: string, file: Buffer): Promise<ImportWorkflowOut> {

		if (!await this.userRepository.existsById(userId)) throw new UserNotFound();

		const { manifest, portable, attachments } = this.read(file);

		if (!await this.platformService.hasVersion(manifest.platform)) throw new PlatformNotFound(manifest.platform);

		// Every package, in the account — installed now if it wasn't.
		const installed: string[] = [];
		const byRef = new Map<string, AccountPackage>();
		for (const pkg of manifest.packages) {
			byRef.set(pkg.ref, await this.ensurePackage(userId, pkg, manifest.platform, installed));
		}

		const accountPackageOf = (ref: unknown, type: HioPackageRef["type"]): AccountPackage => {
			const accountPackage = typeof ref === "string" ? byRef.get(ref) : undefined;
			if (!accountPackage || accountPackage.pkg.type !== type) {
				throw new InvalidWorkflowArchive(`workflow.json refers to a ${type} package (${String(ref)}) the manifest doesn't list`);
			}
			return accountPackage;
		};

		// The schemas back from the packages, the account's ids in place of the refs.
		const boardPackage = accountPackageOf(portable.board?.packageId, "board");
		const components = Array.isArray(portable.components) ? portable.components : [];
		const data = {
			...portable,
			board: { ...portable.board, packageId: boardPackage.id!, base: boardPackage.pkg.schema as IBoardSchema },
			components: components.map(component => {
				// Built-ins (Variables, Logic): no package, this version's schema.
				if (component?.packageId === VARIABLES_PACKAGE_ID) return { ...component, base: VariablesComponentSchema };
				if (component?.packageId === LOGIC_PACKAGE_ID) return { ...component, base: LogicComponentSchema };
				const accountPackage = accountPackageOf(component?.packageId, "component");
				return { ...component, packageId: accountPackage.id!, base: accountPackage.pkg.schema as IComponentSchema };
			}),
		};

		const parsed = WorkflowRuntime.safeParse(data);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			throw new InvalidWorkflowArchive(`workflow.json doesn't fit this version: ${issue?.path.join(".") || "root"} — ${issue?.message}`);
		}

		const name = await this.freeName(userId, manifest.name.trim() || parsed.data.name || "Imported workflow");
		// Credentials travel as references only — the ones that aren't the
		// importer's (another account's, or deleted) leave their configs empty.
		// An archive from before If / Switch had rows: its nodes moved to them.
		const named = { ...migrateLegacyLogic(parsed.data), name };
		const owned = new Set<string>();
		for (const id of workflowCredentialIds(named)) {
			if (await this.credentials.owns(userId, id)) owned.add(id);
		}
		const workflowData = mapWorkflowCredentialValues(named, value => (owned.has(value.credentialId) ? value : null));

		const boardLink = await this.packageLinkRepository.save(PackageLink.fromAccountPackage(boardPackage));
		const workflow = await this.workflowRepository.save(Workflow.create({
			userId,
			data: workflowData,
			boardId: boardLink.id!,
			platform: manifest.platform,
		}));

		// Attached files: stored again under this workflow, the configs pointed
		// at their new ids. One the archive doesn't carry leaves its config empty.
		const values = workflowFileValues(workflowData);
		if (values.length > 0) {
			const newIds = new Map<string, string>();
			for (const value of values) {
				const data = attachments[`${HIO_FILES_DIR}${value.sha256}`];
				if (!data || createHash("sha256").update(data).digest("hex") !== value.sha256 || data.length > WORKFLOW_FILE_MAX_BYTES) continue;
				const stored = await this.fileRepository.save({
					workflowId: workflow.id!, name: value.name, mime: value.mime, size: data.length, sha256: value.sha256, data: Buffer.from(data),
				});
				newIds.set(value.fileId, stored.id);
			}
			workflow.updateData(mapWorkflowFileValues(workflowData, value => {
				const id = newIds.get(value.fileId);
				return id ? { ...value, fileId: id } : null;
			}));
			await this.workflowRepository.update(workflow);
		}

		// The drivers fetch what it needs, as for a new workflow.
		const packages = [
			{ name: boardPackage.pkg.spec, version: boardPackage.pkg.version, role: "board" as const },
			{ name: PLATFORM_PACKAGE, version: workflow.platform, role: "platform" as const },
			...[...new Set(workflowData.components.map(c => c.packageId))]
				.map(id => [...byRef.values()].find(accountPackage => accountPackage.id === id))
				.filter((accountPackage): accountPackage is AccountPackage => !!accountPackage) // built-ins have none
				.map(accountPackage => ({ name: accountPackage.pkg.spec, version: accountPackage.pkg.version, role: "component" as const })),
		];
		for (const driver of this.driverConnectionRegistry.getAllByUser(userId)) {
			this.driverConnectionRegistry.emit(driver.driverId, "workflow:create", { workflowId: workflow.id!, packages });
		}

		this.telemetry.capture("workflow_imported", { packages_installed: installed.length });
		return { id: workflow.id!, name, installed };

	}

	// ── internals ─────────────────────────────────────────────────────────────

	// Unzips the archive and reads its manifest and workflow. @throws InvalidWorkflowArchive.
	private read(file: Buffer) {

		// Capped on the sizes the entries declare, before any is inflated (a zip bomb).
		let unpacked = 0;
		let files: Record<string, Uint8Array>;
		try {
			files = unzipSync(file, {
				filter: (entry) => {
					unpacked += entry.originalSize;
					return unpacked <= HIO_MAX_BYTES;
				},
			});
		} catch {
			throw new InvalidWorkflowArchive("Not a .hio file");
		}
		if (unpacked > HIO_MAX_BYTES) throw new InvalidWorkflowArchive("The file is too large");

		const json = (path: string): unknown => {
			const raw = files[path];
			if (!raw) throw new InvalidWorkflowArchive(`${path} is missing`);
			try {
				return JSON.parse(strFromU8(raw));
			} catch {
				throw new InvalidWorkflowArchive(`${path} isn't valid JSON`);
			}
		};

		const rawManifest = json(HIO_MANIFEST_FILE) as { formatVersion?: unknown };
		// Checked before the schema: a newer format may have changed it.
		if (typeof rawManifest?.formatVersion === "number" && rawManifest.formatVersion > HIO_FORMAT_VERSION) {
			throw new InvalidWorkflowArchive("It was exported by a newer version of Henglos IO — update to import it");
		}
		const manifest = HioManifestSchema.safeParse(rawManifest);
		if (!manifest.success) throw new InvalidWorkflowArchive("manifest.json isn't a Henglos IO workflow manifest");

		const portable = json(HIO_WORKFLOW_FILE);
		if (!portable || typeof portable !== "object") throw new InvalidWorkflowArchive("workflow.json isn't a workflow");

		return {
			manifest: manifest.data,
			portable: portable as { board?: { packageId?: unknown }; components?: { packageId?: unknown }[]; name?: string } & Record<string, unknown>,
			// files/<sha256> — what the configs' file values point at.
			attachments: Object.fromEntries(Object.entries(files).filter(([path]) => path.startsWith(HIO_FILES_DIR))),
		};

	}

	/** The account's install of `pkg` — added from its registry if it has none. */
	private async ensurePackage(userId: string, pkg: HioPackageRef, platform: string, installed: string[]): Promise<AccountPackage> {

		const label = `${pkg.spec}@${pkg.version}`;

		let accountPackage = await this.findInAccount(userId, pkg);
		if (!accountPackage) {
			try {
				accountPackage = await this.addPackageUseCase.execute(userId, label, pkg.registry);
				installed.push(label);
			} catch (err) {
				// Installed meanwhile (another import) — fine.
				accountPackage = await this.findInAccount(userId, pkg);
				if (!accountPackage) throw new ImportPackageFailed(label, describe(err));
			}
		}

		if (accountPackage.pkg.type !== pkg.type) throw new ImportPackageFailed(label, `it's a ${accountPackage.pkg.type}, not a ${pkg.type}`);
		const range = accountPackage.pkg.platform;
		if (range && !semver.satisfies(platform, range, { includePrerelease: true })) throw new ImportPackageFailed(label, `it needs platform ${range}, the workflow uses ${platform}`);

		return accountPackage;

	}

	// The account's install of that exact package version, if it has one.
	private async findInAccount(userId: string, pkg: HioPackageRef): Promise<AccountPackage | null> {
		const known = await this.packageRepository.findByNameVersion(pkg.spec, pkg.version);
		return known ? this.accountPackageRepository.findByUserPackage(userId, known.id!) : null;
	}

	/** `name`, or `name (2)`, `name (3)`… — the first the account doesn't use. */
	private async freeName(userId: string, name: string): Promise<string> {
		if (!await this.workflowRepository.existsByName(userId, name)) return name;
		for (let n = 2; ; n++) {
			const candidate = `${name} (${n})`;
			if (!await this.workflowRepository.existsByName(userId, candidate)) return candidate;
		}
	}

}

// A BaseError carries its reason in `info`, else its id.
function describe(err: unknown): string {
	const error = err as { info?: unknown; id?: unknown; message?: unknown };
	return String(error?.info ?? error?.id ?? error?.message ?? err);
}
