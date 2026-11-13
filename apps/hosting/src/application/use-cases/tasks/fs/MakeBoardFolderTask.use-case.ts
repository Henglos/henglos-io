import { Injectable } from "@nestjs/common";
import type { FsListOut } from "@henglosio/shared";

import { BoardFilesTaskService } from "@/application/services/BoardFilesTask.service";

/** Makes a folder, and answers the tree after it. */
@Injectable()
export class MakeBoardFolderTaskUseCase {

	constructor(private readonly boardFiles: BoardFilesTaskService) {}

	execute(userId: string, driverId: string, workflowId: string, port: string, path: string): Promise<FsListOut> {
		return this.boardFiles.run(userId, driverId, { workflowId, port, op: "mkdir", path }) as Promise<FsListOut>;
	}

}
