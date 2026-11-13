import { Injectable } from "@nestjs/common";
import type { FsListOut } from "@henglosio/shared";

import { BoardFilesTaskService } from "@/application/services/BoardFilesTask.service";

/** Deletes a file or a folder, and answers the tree after it. */
@Injectable()
export class DeleteBoardFileTaskUseCase {

	constructor(private readonly boardFiles: BoardFilesTaskService) {}

	execute(userId: string, driverId: string, workflowId: string, port: string, path: string): Promise<FsListOut> {
		return this.boardFiles.run(userId, driverId, { workflowId, port, op: "delete", path }) as Promise<FsListOut>;
	}

}
