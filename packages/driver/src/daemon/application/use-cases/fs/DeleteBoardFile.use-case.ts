import { injectable } from "tsyringe";
import type { FsListOut } from "@henglosio/shared";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { BoardFilesService, boardPath, notRoot } from "../../services/BoardFiles.service.js";

/** Deletes a file, or a folder with everything in it. Answers the tree after it. */
@injectable()
export class DeleteBoardFileUseCase {

	constructor(private readonly boardFiles: BoardFilesService) {}

	async execute(port: string, path: string, ctx: TaskContext): Promise<FsListOut> {
		const at = notRoot(boardPath(path));
		return this.boardFiles.withRepl(port, ctx, async repl => {
			await repl.remove(at);
			return this.boardFiles.tree(repl);
		});
	}

}
