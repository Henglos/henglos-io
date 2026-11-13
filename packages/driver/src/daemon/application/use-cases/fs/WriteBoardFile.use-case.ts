import { injectable } from "tsyringe";
import type { FsListOut } from "@henglosio/shared";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { BoardFilesService, boardPath, notRoot, parents } from "../../services/BoardFiles.service.js";

const notAFolderScript = (path: string) => `
import os
try:
    _dir = os.stat(${JSON.stringify(path)})[0] & 0x4000
except OSError:
    _dir = 0
if _dir:
    raise OSError("a folder has that name: " + ${JSON.stringify(path)})
`;

/** `data` to `path` — a new file or over an old one; the folders it's in made first. Answers the tree after it. */
@injectable()
export class WriteBoardFileUseCase {

	constructor(private readonly boardFiles: BoardFilesService) {}

	async execute(port: string, path: string, data: Uint8Array, ctx: TaskContext): Promise<FsListOut> {
		const at = notRoot(boardPath(path));
		return this.boardFiles.withRepl(port, ctx, async repl => {
			await repl.exec(notAFolderScript(at));
			await repl.mkdirs(parents(at));
			await repl.writeFile(at, data);
			return this.boardFiles.tree(repl);
		});
	}

}
