import { Injectable } from "@nestjs/common";
import type { FsListOut } from "@henglosio/shared";

import { BoardFilesTaskService } from "@/application/services/BoardFilesTask.service";
import { ActionRunFailed } from "@/application/errors/Workflow.error";

const WRITE_TIMEOUT_MS = 300_000;

/** The biggest file written to a board at once — a good part of an ESP32's ~1.4 MB, ~2 minutes over the REPL. */
export const BOARD_FILE_MAX_BYTES = 512 * 1024;

/** Writes a file (over what's there), and answers the tree after it. @throws ActionRunFailed past BOARD_FILE_MAX_BYTES. */
@Injectable()
export class WriteBoardFileTaskUseCase {

	constructor(private readonly boardFiles: BoardFilesTaskService) {}

	execute(userId: string, driverId: string, workflowId: string, port: string, path: string, data: Uint8Array): Promise<FsListOut> {
		if (data.length > BOARD_FILE_MAX_BYTES) throw new ActionRunFailed(`Files go up to ${BOARD_FILE_MAX_BYTES / 1024} KB`);
		return this.boardFiles.run(userId, driverId, { workflowId, port, op: "write", path, data: new Uint8Array(data) }, WRITE_TIMEOUT_MS) as Promise<FsListOut>;
	}

}
