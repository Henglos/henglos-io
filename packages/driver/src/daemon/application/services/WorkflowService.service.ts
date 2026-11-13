import os from "os";
import path from "path";
import fs from "fs/promises";
import { injectable } from "tsyringe";
import { createHash } from "crypto";

/** One package of a workflow, as installed in the driver's cache. */
export type PackageMetadata = {
	name: string;
	version: string;
	path: string
};

/** The packages a workflow builds with: its board, its platform and its components. */
export type WorkflowDependencies = {

	board: PackageMetadata | null;
	platform: PackageMetadata | null;
	components: PackageMetadata[];
	/** Why the last sync couldn't install a package. Absent: it could. */
	syncError?: string;

};

/** A workflow the driver has, with its packages. */
export type WorkflowSynced = {

	id: string;
	dependencies: WorkflowDependencies;

}
/**
 * The workflows synced to this driver (~/.henglos/io/driver/workflows): one folder each, with
 * the packages it needs (metadata.json).
 */
@injectable()
export class WorkflowService {
	private readonly WORKFLOWS_DIR = path.join(
		os.homedir(),
		".henglos",
		"io",
		"driver",
		"workflows",
	);
	private readonly DEFAULT_METADATA: WorkflowDependencies = {
		board: null,
		platform: null,
		components: []
	}

	constructor() {}

	async initialize() {
		await fs.mkdir(this.WORKFLOWS_DIR, { recursive: true });
	}

	async create(workflowId: string) {

		const workflowPath = path.join(this.WORKFLOWS_DIR, workflowId);
		await fs.mkdir(workflowPath, { recursive: true });
		await fs.writeFile(path.join(workflowPath, "metadata.json"), JSON.stringify(this.DEFAULT_METADATA), { encoding: "utf-8"});

	}

	async exists(workflowId: string) {

		try {

			const stats = await fs.stat(path.join(this.WORKFLOWS_DIR, workflowId));
			return stats.isDirectory();

		}catch (error) {

			return false;

		}

	}

	async list(): Promise<WorkflowSynced[]> {

		const files = await fs.readdir(this.WORKFLOWS_DIR, { withFileTypes: true });

		return Promise.all(
			files
				.filter(file => file.isDirectory())
				.map(async file => ({
					id: file.name,
					dependencies: await this.getMetadata(file.name),
				}))
		);

	}

	async remove(workflowId: string) {

		await fs.rm(path.join(this.WORKFLOWS_DIR, workflowId), { recursive: true });

	}

	async getMetadata(workflowId: string): Promise<WorkflowDependencies> {

		const metadataPath = path.join(this.WORKFLOWS_DIR, workflowId, "metadata.json");

		await fs.access(metadataPath, fs.constants.F_OK).catch(() => this.createMetadata(workflowId));

		const raw = await fs.readFile(metadataPath, { encoding: "utf-8" });
		return JSON.parse(raw) as WorkflowDependencies;

	}

	async createMetadata(workflowId: string) {

		if (!await this.exists(workflowId)) throw new Error("Workflow not found");

		await fs.writeFile(
			path.join(this.WORKFLOWS_DIR, workflowId, "metadata.json"),
			JSON.stringify(this.DEFAULT_METADATA),
			{ encoding: "utf-8" }
		);

	}

	async saveMetadata(workflowId: string, metadata: WorkflowDependencies) {

		await fs.writeFile(
			path.join(this.WORKFLOWS_DIR, workflowId, "metadata.json"),
			JSON.stringify(metadata),
			{ encoding: "utf-8" }
		);

	}

	// The build is the runtime only, for the board's MicroPython: board and
	// platform are mounted into its container — either changing means a new
	// container and a new build. Components aren't part of it: each session
	// installs what it uses (BoardInstaller), so changing them needs no build.
	computePackagesHash(board: PackageMetadata, platform: PackageMetadata): string {
		const parts = [
			`${board.name}@${board.version}`,
			`${platform.name}@${platform.version}`,
		];
		return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);

	}

	// Where the build container leaves what gets uploaded to the board
	// (mounted at the board manifest's build.output).
	buildPath(workflowId: string): string {
		return path.join(this.WORKFLOWS_DIR, workflowId, "build");
	}

	
}
