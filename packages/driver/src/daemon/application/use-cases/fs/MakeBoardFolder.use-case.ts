import { injectable } from "tsyringe";
import type { FsListOut } from "@henglosio/shared";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { BoardFilesService, boardPath, notRoot, parents } from "../../services/BoardFiles.service.js";

/** Makes a folder, and the ones above it that are missing. Answers the tree after it. */
@injectable()
export class MakeBoardFolderUseCase {

	constructor(private readonly boardFiles: BoardFilesService) {}

	async execute(port: string, path: string, ctx: TaskContext): Promise<FsListOut> {
		const at = notRoot(boardPath(path));
		return this.boardFiles.withRepl(port, ctx, async repl => {
			await repl.mkdirs([...parents(at), at]);
			return this.boardFiles.tree(repl);
		});
	}

}
