import { injectable } from "tsyringe";
import { type TaskFsPayload, type TaskType, TaskFsPayloadSchema } from "@henglosio/shared";

import type { ITaskCommand } from "../../domain/interfaces/ICommand.interface.js";
import { TaskContext } from "../../domain/entities/TaskContext.js";
import { ListBoardFilesUseCase } from "../use-cases/fs/ListBoardFiles.use-case.js";
import { ReadBoardFileUseCase } from "../use-cases/fs/ReadBoardFile.use-case.js";
import { WriteBoardFileUseCase } from "../use-cases/fs/WriteBoardFile.use-case.js";
import { DeleteBoardFileUseCase } from "../use-cases/fs/DeleteBoardFile.use-case.js";
import { MakeBoardFolderUseCase } from "../use-cases/fs/MakeBoardFolder.use-case.js";
import { RenameBoardFileUseCase } from "../use-cases/fs/RenameBoardFile.use-case.js";

/** The `fs` task: the board's files — list, read, write, delete, mkdir, rename. Locks the board's port. */
@injectable()
export class FsTaskCommand implements ITaskCommand<TaskFsPayload> {
	readonly type: TaskType = "fs";
	constructor(
		private readonly listBoardFiles: ListBoardFilesUseCase,
		private readonly readBoardFile: ReadBoardFileUseCase,
		private readonly writeBoardFile: WriteBoardFileUseCase,
		private readonly deleteBoardFile: DeleteBoardFileUseCase,
		private readonly makeBoardFolder: MakeBoardFolderUseCase,
		private readonly renameBoardFile: RenameBoardFileUseCase,
	) {}
	isValidPayload(p: unknown): p is TaskFsPayload { return TaskFsPayloadSchema.safeParse(p).success; }
	locks(p: TaskFsPayload): string[] { return [`port:${p.port}`]; }
	execute(p: TaskFsPayload, ctx: TaskContext) {
		const path = p.path ?? "";
		switch (p.op) {
			case "list":   return this.listBoardFiles.execute(p.port, ctx);
			case "read":   return this.readBoardFile.execute(p.port, path, ctx);
			case "write":  return this.writeBoardFile.execute(p.port, path, new Uint8Array(p.data ?? []), ctx);
			case "delete": return this.deleteBoardFile.execute(p.port, path, ctx);
			case "mkdir":  return this.makeBoardFolder.execute(p.port, path, ctx);
			case "rename": return this.renameBoardFile.execute(p.port, path, p.to ?? "", ctx);
		}
	}
}
