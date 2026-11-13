import { injectable } from "tsyringe";
import type { FsEntry, FsListOut } from "@henglosio/shared";
import { TaskContext } from "../../domain/entities/TaskContext.js";
import { ReplSession } from "./ReplSession.service.js";

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
export const parents = (path: string) => {
	const parts = path.split("/").filter(Boolean).slice(0, -1);
	return parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/"));
};

/** `path`, unless it's the root — which no change can touch. */
export const notRoot = (path: string) => {
	if (path === "/") throw new Error("The root of the board can't be changed");
	return path;
};

/**
 * What the fs use cases share: a session on the board's raw REPL, and its file
 * tree. Opening the REPL stops the board's program; closing soft-resets it, so
 * it plays again.
 */
@injectable()
export class BoardFilesService {

	/** How the board's REPL is opened — tests open a fake one. */
	open: (port: string) => Promise<ReplSession> = port => ReplSession.open(port);

	/** The tree from /, folders first, and the space on the board. */
	async tree(repl: ReplSession): Promise<FsListOut> {
		const [total, free, tree] = JSON.parse((await repl.exec(LIST, 30_000)).trim()) as [number, number, RawEntry[]];
		return { total, free, tree: tree.map(toEntry).sort(byFolderThenName) };
	}

	/** Runs `run` on the board's REPL, closing it afterwards. */
	async withRepl<T>(port: string, ctx: TaskContext, run: (repl: ReplSession) => Promise<T>): Promise<T> {
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
