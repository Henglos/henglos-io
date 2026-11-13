import { injectable } from "tsyringe";
import type { FsListOut } from "@henglosio/shared";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { BoardFilesService, boardPath, notRoot, parents } from "../../services/BoardFiles.service.js";

const renameScript = (from: string, to: string) => `
import os
def _kind(p):
    try:
        return "dir" if os.stat(p)[0] & 0x4000 else "file"
    except OSError:
        return None
_a, _b = ${JSON.stringify(from)}, ${JSON.stringify(to)}
if _kind(_a) is None:
    raise OSError("no such file or folder: " + _a)
if _kind(_b) is not None:
    raise OSError("already exists: " + _b)
os.rename(_a, _b)
`;

/** `path` to `to` — a rename in the same folder, a move to another. Never over something. Answers the tree after it. */
@injectable()
export class RenameBoardFileUseCase {

	constructor(private readonly boardFiles: BoardFilesService) {}

	async execute(port: string, path: string, to: string, ctx: TaskContext): Promise<FsListOut> {
		const from = notRoot(boardPath(path));
		const target = notRoot(boardPath(to));
		if (target === from || target.startsWith(from + "/")) throw new Error(`Can't move ${from} into itself`);
		return this.boardFiles.withRepl(port, ctx, async repl => {
			await repl.mkdirs(parents(target));
			await repl.exec(renameScript(from, target));
			return this.boardFiles.tree(repl);
		});
	}

}
