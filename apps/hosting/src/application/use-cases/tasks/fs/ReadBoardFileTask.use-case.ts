import { Injectable } from "@nestjs/common";
import type { FsReadOut } from "@henglosio/shared";

import { BoardFilesTaskService } from "@/application/services/BoardFilesTask.service";

/** One file's contents. */
@Injectable()
export class ReadBoardFileTaskUseCase {

	constructor(private readonly boardFiles: BoardFilesTaskService) {}

	execute(userId: string, driverId: string, workflowId: string, port: string, path: string): Promise<FsReadOut> {
		return this.boardFiles.run(userId, driverId, { workflowId, port, op: "read", path }) as Promise<FsReadOut>;
	}

}
