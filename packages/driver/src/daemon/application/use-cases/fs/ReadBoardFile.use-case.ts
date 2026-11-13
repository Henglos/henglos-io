import { injectable } from "tsyringe";
import type { FsReadOut } from "@henglosio/shared";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { BoardFilesService, boardPath } from "../../services/BoardFiles.service.js";

// The most of a file a read brings back — enough for any script or config;
// a bigger file comes back cut, marked `truncated`.
const READ_CAP = 128 * 1024;
// A multiple of 3: each chunk's base64 has no padding, so the lines join into one.
const READ_CHUNK = 768;

const readScript = (path: string) => `
import os, ubinascii
_p = ${JSON.stringify(path)}
_n = os.stat(_p)[6]
print(_n)
with open(_p, "rb") as _f:
    _left = ${READ_CAP}
    while _left > 0:
        _b = _f.read(min(${READ_CHUNK}, _left))
        if not _b:
            break
        _left -= len(_b)
        print(ubinascii.b2a_base64(_b).decode().strip())
`;

/** One file's bytes, as base64. */
@injectable()
export class ReadBoardFileUseCase {

	constructor(private readonly boardFiles: BoardFilesService) {}

	async execute(port: string, path: string, ctx: TaskContext): Promise<FsReadOut> {
		const at = boardPath(path);
		return this.boardFiles.withRepl(port, ctx, async repl => {
			const [size, ...chunks] = (await repl.exec(readScript(at), 90_000)).trim().split(/\r?\n/);
			const data = chunks.join("");
			const got = Buffer.from(data, "base64").length;
			return { path: at, size: Number(size), data, truncated: got < Number(size) };
		});
	}

}
