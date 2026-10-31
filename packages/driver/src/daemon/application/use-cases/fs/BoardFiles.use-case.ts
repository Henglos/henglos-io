import { injectable } from "tsyringe";
import type { FsEntry, FsListOut, FsReadOut } from "@henglosio/shared";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { ReplSession } from "../../services/ReplSession.js";

// The most of a file a read brings back — enough for any script or config;
// a bigger file comes back cut, marked `truncated`.
const READ_CAP = 128 * 1024;
// A multiple of 3: each chunk's base64 has no padding, so the lines join into one.
const READ_CHUNK = 768;

// Walks the filesystem from / — [name, is a folder, size, children] per entry.
const LIST = `
import os, json
def _w(p):
    out = []
    for e in os.ilistdir(p):
        full = (p if p != "/" else "") + "/" + e[0]
        if e[1] & 0x4000:
            out.append([e[0], 1, 0, _w(full)])
        else:
            out.append([e[0], 0, e[3] if len(e) > 3 else 0])
    return out
_s = os.statvfs("/")
print(json.dumps([_s[1] * _s[2], _s[1] * _s[3], _w("/")]))
`;

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

// Whether `p` is there, and whether it's a folder — the checks the changes need.
const EXISTS = `
import os
def _kind(p):
    try:
        return "dir" if os.stat(p)[0] & 0x4000 else "file"
    except OSError:
        return None
`;

const renameScript = (from: string, to: string) => `${EXISTS}
_a, _b = ${JSON.stringify(from)}, ${JSON.stringify(to)}
if _kind(_a) is None:
    raise OSError("no such file or folder: " + _a)
if _kind(_b) is not None:
    raise OSError("already exists: " + _b)
os.rename(_a, _b)
`;

const notAFolderScript = (path: string) => `${EXISTS}
if _kind(${JSON.stringify(path)}) == "dir":
    raise OSError("a folder has that name: " + ${JSON.stringify(path)})
`;

type RawEntry = [string, 0 | 1, number, RawEntry[]?];

const toEntry = ([name, dir, size, children]: RawEntry): FsEntry => ({
	name,
	dir: dir === 1,
	size,
	...(dir === 1 && { children: (children ?? []).map(toEntry).sort(byFolderThenName) }),
});

const byFolderThenName = (a: FsEntry, b: FsEntry) =>
	a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name);

/** `path` as a clean board path ("/a/b") — or an error for one that isn't. */
export function boardPath(path: string | undefined): string {
	if (!path || !path.startsWith("/")) throw new Error(`Not a board path: ${path ?? "(none)"}`);
	const parts = path.split("/").filter(Boolean);
	if (parts.some(part => part === "." || part === ".." || /[\0\\]/.test(part))) throw new Error(`Not a board path: ${path}`);
	return "/" + parts.join("/");
}

/** Every folder above `path`, outermost first: "/a/b/c.py" -> ["/a", "/a/b"]. */
const parents = (path: string) => {
	const parts = path.split("/").filter(Boolean).slice(0, -1);
	return parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/"));
};

const notRoot = (path: string) => {
	if (path === "/") throw new Error("The root of the board can't be changed");
	return path;
};

/**
 * The board's files, through its raw REPL — the tree with sizes and the
 * free space, one file's bytes, and the changes: write, delete, make a
 * folder, rename/move. A change answers the tree as it is after it, read in
 * the same session. Opening the REPL stops the board's program; closing
 * soft-resets it, so it plays again.
 */
@injectable()
export class BoardFilesUseCase {

	/** How the board's REPL is opened — tests open a fake one. */
	open: (port: string) => Promise<ReplSession> = port => ReplSession.open(port);

	async list(port: string, ctx: TaskContext): Promise<FsListOut> {
		return this.withRepl(port, ctx, repl => this.tree(repl));
	}

	async read(port: string, path: string, ctx: TaskContext): Promise<FsReadOut> {
		const at = boardPath(path);
		return this.withRepl(port, ctx, async repl => {
			const [size, ...chunks] = (await repl.exec(readScript(at), 90_000)).trim().split(/\r?\n/);
			const data = chunks.join("");
			const got = Buffer.from(data, "base64").length;
			return { path: at, size: Number(size), data, truncated: got < Number(size) };
		});
	}

	/** `data` to `path` — a new file or over an old one; the folders it's in made first. */
	async write(port: string, path: string, data: Uint8Array, ctx: TaskContext): Promise<FsListOut> {
		const at = notRoot(boardPath(path));
		return this.withRepl(port, ctx, async repl => {
			await repl.exec(notAFolderScript(at));
			await repl.mkdirs(parents(at));
			await repl.writeFile(at, data);
			return this.tree(repl);
		});
	}

	/** A file, or a folder with everything in it. */
	async remove(port: string, path: string, ctx: TaskContext): Promise<FsListOut> {
		const at = notRoot(boardPath(path));
		return this.withRepl(port, ctx, async repl => {
			await repl.remove(at);
			return this.tree(repl);
		});
	}

	/** A folder, and the ones above it that are missing. */
	async mkdir(port: string, path: string, ctx: TaskContext): Promise<FsListOut> {
		const at = notRoot(boardPath(path));
		return this.withRepl(port, ctx, async repl => {
			await repl.mkdirs([...parents(at), at]);
			return this.tree(repl);
		});
	}

	/** `path` to `to` — a rename in the same folder, a move to another. Never over something. */
	async rename(port: string, path: string, to: string, ctx: TaskContext): Promise<FsListOut> {
		const from = notRoot(boardPath(path));
		const target = notRoot(boardPath(to));
		if (target === from || target.startsWith(from + "/")) throw new Error(`Can't move ${from} into itself`);
		return this.withRepl(port, ctx, async repl => {
			await repl.mkdirs(parents(target));
			await repl.exec(renameScript(from, target));
			return this.tree(repl);
		});
	}

	private async tree(repl: ReplSession): Promise<FsListOut> {
		const [total, free, tree] = JSON.parse((await repl.exec(LIST, 30_000)).trim()) as [number, number, RawEntry[]];
		return { total, free, tree: tree.map(toEntry).sort(byFolderThenName) };
	}

	private async withRepl<T>(port: string, ctx: TaskContext, run: (repl: ReplSession) => Promise<T>): Promise<T> {
		const repl = await this.open(port);
		// A cancel closes the REPL under what it's doing, which then fails.
		const onAbort = () => { void repl.close(true); };
		ctx.signal.addEventListener("abort", onAbort, { once: true });
		try {
			return await run(repl);
		} finally {
			ctx.signal.removeEventListener("abort", onAbort);
			await repl.close(true);
		}
	}

}
