import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { injectable } from "tsyringe";
import type { BoardInstall } from "@henglosio/shared";
import { MpyCompiler } from "./MpyCompiler.js";
import { PackageService } from "./PackageService.js";

// Puts on the board what a session needs, right before its first frame —
// so a workflow's components never need a build or a flash:
//
//   /components/<component>/<action>.mpy   the actions on the canvas only
//   /components/<component>/<module>.mpy   what their scripts import (from .x import …)
//   /files/<sha>.<ext>                     files attached to configs
//   /secrets/<credential id>.json          credentials picked in configs (the hosting's values)
//
// Compiled here (MpyCompiler); a board whose MicroPython doesn't import
// .mpy v6 gets the .py source instead. Each root keeps an .index.json of
// what it holds (path -> sha256 of the bytes), so only what changed is sent
// and what's no longer used is removed.
//
// The board's runtime imports /components when the session's first frame
// creates it (hio/tools/repl.py) — but main.py, which ran until the REPL
// stopped it, may have imported older versions already: those are dropped
// from sys.modules here, so the new ones load.

/** What BoardInstaller needs of the board — ReplSession, or a fake in tests. */
export interface BoardFiles {
	exec(code: string, timeoutMs?: number): Promise<string>;
	writeFile(path: string, data: Uint8Array): Promise<void>;
	remove(path: string): Promise<void>;
	mkdirs(paths: string[]): Promise<void>;
	mpyVersion(): Promise<[number, number] | null>;
}

/** Where BoardInstaller reports how it's going: a phase with its percentage, or a line for the log. */
export type InstallProgress = { progress(phase: string, pct?: number): void; info(line: string): void };

type Wanted = { data: Uint8Array; sha: string };

// /secrets as the rest: what a session no longer uses is removed — a
// credential stays on the board only while a workflow there picks it.
const ROOTS = ["/components", "/files", "/secrets"] as const;
const INDEX = ".index.json";

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

// Relative imports of a MicroPython module: `from .oled import x`, `from . import fonts, icons`.
const RELATIVE_FROM = /^\s*from\s+\.([A-Za-z_][\w]*)?\s+import\s+([^\n#]+)/gm;

/** The modules `source` imports from its own folder (by module name). */
export function relativeImports(source: string): string[] {
	const found = new Set<string>();
	for (const match of source.matchAll(RELATIVE_FROM)) {
		if (match[1]) {
			found.add(match[1]);
			continue;
		}
		// `from . import a, b as c` — each name is a module of the folder.
		for (const part of match[2]!.replace(/[()]/g, "").split(",")) {
			const name = part.trim().split(/\s+/)[0];
			if (name && /^[A-Za-z_]\w*$/.test(name)) found.add(name);
		}
	}
	return [...found];
}

/**
 * Puts on the board what a session needs before its first frame (see the hosting's
 * BuildBoardInstall): the components' compiled modules, the attached files and the credentials.
 * Only what changed is written — the board keeps an index of what's there, by hash — and what
 * no session needs any more is removed.
 */
@injectable()
export class BoardInstaller {

	constructor(
		private readonly packages: PackageService,
		private readonly compiler: MpyCompiler,
	) {}

	async sync(board: BoardFiles, install: BoardInstall, log: InstallProgress): Promise<void> {

		log.progress("install", 0);

		const version = await board.mpyVersion();
		const compiled = version?.[0] === MpyCompiler.ABI;
		if (!compiled) {
			log.info(`The board's MicroPython doesn't import .mpy v${MpyCompiler.ABI}${version ? ` (it has v${version[0]})` : ""} — sending the components as .py source.`);
		}

		const wanted = new Map<string, Wanted>();
		const want = (boardPath: string, data: Uint8Array) => wanted.set(boardPath, { data, sha: sha256(data) });

		// ── Components: the actions used, and what they import ─────────────────
		const empty = new Uint8Array(0);
		if (install.components.length > 0) want("/components/__init__.py", empty);

		for (const component of install.components) {
			const cached = await this.packages.getPackage(component.name, component.version)
				?? await this.packages.install(component.name, component.version);
			if (!cached) throw new Error(`Couldn't get ${component.name}@${component.version} on this driver.`);

			const folder = `/components/${component.module}`;
			want(`${folder}/__init__.py`, empty);

			const actionModules = new Set(component.actions.map(action => action.module));
			// source file (absolute, on this machine) -> module name on the board
			const modules = new Map<string, string>();
			const queue: { file: string; module: string }[] = component.actions.map(action => ({
				file: path.resolve(cached.path, action.script),
				module: action.module,
			}));

			while (queue.length > 0) {
				const { file, module } = queue.shift()!;
				if (modules.has(file)) continue;
				modules.set(file, module);

				const source = await fs.readFile(file, "utf-8").catch(() => {
					throw new Error(`${component.name}@${component.version}: ${path.relative(cached.path, file)} isn't in the package.`);
				});

				for (const imported of relativeImports(source)) {
					const dependency = path.join(path.dirname(file), `${imported}.py`);
					if (modules.has(dependency)) continue;
					if (actionModules.has(imported) && !component.actions.some(a => path.resolve(cached.path, a.script) === dependency)) {
						throw new Error(`${component.name}: ${imported}.py clashes with the module of an action — rename one of them.`);
					}
					queue.push({ file: dependency, module: imported });
				}

				const name = `components/${component.module}/${module}.py`;
				if (compiled) want(`${folder}/${module}.mpy`, await this.compiler.compile(name, source));
				else want(`${folder}/${module}.py`, new TextEncoder().encode(source));
			}
		}

		// ── Files attached to configs ─────────────────────────────────────────
		for (const file of install.files) {
			// Only where the installer keeps track — never over the runtime, main.py…
			if (!/^\/(files|secrets)\/[^/]+$/.test(file.path)) throw new Error(`${file.path}: not a place to install a file.`);
			const data = new Uint8Array(file.data);
			if (sha256(data) !== file.sha256) throw new Error(`${file.path}: its data doesn't match its sha256.`);
			wanted.set(file.path, { data, sha: file.sha256 });
		}

		// ── What the board has ─────────────────────────────────────────────────
		const onBoard = await this.read(board);
		const toWrite = [...wanted].filter(([boardPath, { sha }]) => !onBoard.present.has(boardPath) || onBoard.index[boardPath] !== sha);
		const toRemove = [...onBoard.present].filter(boardPath => !wanted.has(boardPath) && !boardPath.endsWith(`/${INDEX}`));

		for (const boardPath of toRemove) await board.remove(boardPath);
		// Component folders nothing is wanted in any more.
		const keptFolders = new Set([...wanted.keys()].map(p => p.slice(0, p.lastIndexOf("/"))));
		for (const folder of onBoard.folders) {
			if (!keptFolders.has(folder)) await board.remove(folder);
		}

		const folders = [...new Set(toWrite.map(([p]) => p.slice(0, p.lastIndexOf("/"))))]
			.flatMap(folder => folder.split("/").slice(1).map((_, i, parts) => "/" + parts.slice(0, i + 1).join("/")))
			.filter((folder, i, all) => all.indexOf(folder) === i)
			.sort((a, b) => a.length - b.length);
		await board.mkdirs(folders);

		for (const [i, [boardPath, { data }]] of toWrite.entries()) {
			await board.writeFile(boardPath, data);
			log.progress("install", Math.round(((i + 1) / toWrite.length) * 100));
		}

		// The indexes, as the roots now are — rewritten only when that changed.
		for (const root of ROOTS) {
			const entries = Object.fromEntries([...wanted].filter(([p]) => p.startsWith(`${root}/`)).map(([p, { sha }]) => [p, sha]));
			const before = Object.fromEntries(Object.entries(onBoard.index).filter(([p]) => p.startsWith(`${root}/`)));
			const unchanged = JSON.stringify(Object.entries(entries).sort()) === JSON.stringify(Object.entries(before).sort())
				&& onBoard.present.has(`${root}/${INDEX}`);
			if (unchanged || (Object.keys(entries).length === 0 && !onBoard.roots.has(root))) continue;
			await board.mkdirs([root]);
			await board.writeFile(`${root}/${INDEX}`, new TextEncoder().encode(JSON.stringify(entries)));
		}

		// What main.py imported is dropped, so the session's runtime loads the
		// components afresh: the new versions, and a clean state — a session
		// doesn't inherit what the stored program left in them (a joystick's center...).
		if (install.components.length > 0 || toWrite.length > 0 || toRemove.length > 0) {
			await board.exec("import sys\nfor _k in [k for k in sys.modules if k == 'components' or k.startswith('components.')]: del sys.modules[_k]\nimport gc\ngc.collect()");
		}

		const bytes = toWrite.reduce((sum, [, { data }]) => sum + data.length, 0);
		log.info(toWrite.length > 0 || toRemove.length > 0
			? `Board: ${toWrite.length} file(s) sent (${(bytes / 1024).toFixed(1)} KB), ${wanted.size - toWrite.length} already there, ${toRemove.length} removed.`
			: `Board: up to date (${wanted.size} file(s)).`);
		log.progress("install", 100);

	}

	// The board's files under the roots, its folders under /components, and the indexes.
	private async read(board: BoardFiles): Promise<{ present: Set<string>; folders: string[]; roots: Set<string>; index: Record<string, string> }> {
		const out = await board.exec([
			"import os, json",
			"_r = {'files': [], 'dirs': [], 'roots': [], 'index': {}}",
			"def _walk(p):",
			"    for n in os.listdir(p):",
			"        c = p + '/' + n",
			"        if os.stat(c)[0] & 0x4000:",
			"            _r['dirs'].append(c)",
			"            _walk(c)",
			"        else: _r['files'].append(c)",
			`for _root in ${JSON.stringify(ROOTS)}:`,
			"    try: os.stat(_root)",
			"    except OSError: continue",
			"    _r['roots'].append(_root)",
			"    _walk(_root)",
			"    try:",
			`        with open(_root + '/${INDEX}') as _f: _r['index'].update(json.load(_f))`,
			"    except Exception: pass",
			"print('<<' + json.dumps(_r) + '>>')",
		].join("\n"), 30000);

		const match = /<<(.*)>>/s.exec(out);
		const parsed = match ? JSON.parse(match[1]!) as { files: string[]; dirs: string[]; roots: string[]; index: Record<string, string> } : { files: [], dirs: [], roots: [], index: {} };
		return {
			present: new Set(parsed.files),
			folders: parsed.dirs.filter(dir => dir.startsWith("/components/")),
			roots: new Set(parsed.roots),
			index: parsed.index,
		};
	}

}
