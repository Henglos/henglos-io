import { injectable } from "tsyringe";
import type { FsListOut } from "@henglosio/shared";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { BoardFilesService } from "../../services/BoardFiles.service.js";

/** The board's file tree, with sizes and the free space. */
@injectable()
export class ListBoardFilesUseCase {

	constructor(private readonly boardFiles: BoardFilesService) {}

	async execute(port: string, ctx: TaskContext): Promise<FsListOut> {
		return this.boardFiles.withRepl(port, ctx, repl => this.boardFiles.tree(repl));
	}

}
