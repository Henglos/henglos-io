import { Injectable } from "@nestjs/common";
import type { FsListOut } from "@henglosio/shared";

import { BoardFilesTaskService } from "@/application/services/BoardFilesTask.service";

/** Renames or moves a file or a folder, and answers the tree after it. */
@Injectable()
export class RenameBoardFileTaskUseCase {

	constructor(private readonly boardFiles: BoardFilesTaskService) {}

	execute(userId: string, driverId: string, workflowId: string, port: string, path: string, to: string): Promise<FsListOut> {
		return this.boardFiles.run(userId, driverId, { workflowId, port, op: "rename", path, to }) as Promise<FsListOut>;
	}

}
