import { Injectable } from "@nestjs/common";
import type { FsListOut } from "@henglosio/shared";

import { BoardFilesTaskService } from "@/application/services/BoardFilesTask.service";

/** The board's whole file tree. */
@Injectable()
export class ListBoardFilesTaskUseCase {

	constructor(private readonly boardFiles: BoardFilesTaskService) {}

	execute(userId: string, driverId: string, workflowId: string, port: string): Promise<FsListOut> {
		return this.boardFiles.run(userId, driverId, { workflowId, port, op: "list" }) as Promise<FsListOut>;
	}

}
