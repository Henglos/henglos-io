import { Button, Text } from "@henglosio/ui";
import {
	ChevronDown, ChevronRight, Download, File, FilePlus, Folder, FolderOpen, FolderPlus,
	Loader2, Pencil, RefreshCw, RotateCcw, Save, Trash2, Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { isAxiosError } from "axios";
import clsx from "clsx";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { FsEntry, FsListOut, FsReadOut } from "@henglosio/shared";
import { deleteBoardFile, listBoardFiles, makeBoardFolder, readBoardFile, renameBoardFile, writeBoardFile } from "@shared/api";
import { WorkflowAtom } from "../../store/workflow.store";
import { DeviceSelectionAtom, DriverConnectionAtom } from "../../store/driver.store";
import { defineHenglosMonacoTheme, HENGLOS_MONACO_THEME } from "../../features/code-editor/henglosMonacoTheme";

// Bytes of a binary file shown as hex — the rest is in the download.
const HEX_PREVIEW = 512;
// What the hosting takes in one write (an upload, a save).
const MAX_WRITE = 512 * 1024;
// What the runtime and the sessions keep on the board — changing them can
// stop it working until a Flash (or the next Play reinstalls them). /secrets
// holds the credentials a workflow picks (their values, in the clear).
const SYSTEM = ["/hio", "/main.py", "/boot.py", "/components", "/files", "/secrets"];

const reasonOf = (err: unknown) => {
	// BaseError.toResponseString(): { id, info } — or a plain message.
	const data = isAxiosError(err) ? err.response?.data as { id?: string; info?: string; message?: string } | undefined : undefined;
	return data?.info ?? data?.message ?? data?.id ?? (err instanceof Error ? err.message : String(err));
};

const size = (bytes: number) =>
	bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const decode = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));

// In pieces: spreading a whole file into fromCharCode overflows the stack.
const encode = (bytes: Uint8Array) => {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
};

// Text when it decodes as UTF-8 and has no NULs — a script, a JSON, a PBM's header…
const asText = (bytes: Uint8Array): string | null => {
	if (bytes.includes(0)) return null;
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
};

const hexDump = (bytes: Uint8Array) => {
	const lines: string[] = [];
	for (let offset = 0; offset < bytes.length; offset += 16) {
		const row = bytes.subarray(offset, offset + 16);
		const hex = Array.from(row, b => b.toString(16).padStart(2, "0")).join(" ");
		const ascii = Array.from(row, b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
		lines.push(`${offset.toString(16).padStart(6, "0")}  ${hex.padEnd(47)}  ${ascii}`);
	}
	return lines.join("\n");
};

const join = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;
const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const isSystem = (path: string) => SYSTEM.some(system => path === system || path.startsWith(system + "/"));
const validName = (name: string) => !!name && !/[/\\\0]/.test(name) && name !== "." && name !== "..";

const languageOf = (path: string) =>
	path.endsWith(".py") ? "python" : path.endsWith(".json") ? "json" : path.endsWith(".md") ? "markdown" : "plaintext";

/** The entry at `path` in the tree, if there's one. */
const find = (tree: FsEntry[], path: string): FsEntry | null => {
	let level: FsEntry[] | undefined = tree;
	let found: FsEntry | null = null;
	for (const part of path.split("/").filter(Boolean)) {
		found = level?.find(entry => entry.name === part) ?? null;
		if (!found) return null;
		level = found.children;
	}
	return found;
};

type Selection = { path: string; dir: boolean };
// The name being typed — a new file or folder in `folder`, or a rename of `path`.
type Naming = { kind: "file" | "folder"; folder: string; value: string } | { kind: "rename"; path: string; value: string };

const NameInput: React.FC<{ naming: Naming; onChange: (value: string) => void; onDone: (ok: boolean) => void }> = ({ naming, onChange, onDone }) => (
	<div className="flex items-center gap-1.5 px-3 py-1 bg-hover">
		{naming.kind === "folder" ? <FolderPlus size={13} className="shrink-0 text-accent-fg" /> : naming.kind === "file" ? <FilePlus size={13} className="shrink-0 text-fg-muted" /> : <Pencil size={12} className="shrink-0 text-fg-muted" />}
		<input
			autoFocus
			value={naming.value}
			onChange={e => onChange(e.target.value)}
			onKeyDown={e => { if (e.key === "Enter") onDone(true); if (e.key === "Escape") onDone(false); }}
			onBlur={() => onDone(false)}
			placeholder={naming.kind === "folder" ? "folder name" : "file name"}
			className="flex-1 min-w-0 bg-transparent outline-none text-xs font-mono text-fg"
		/>
		<Text variant="low" size="xs" className="shrink-0 font-mono truncate max-w-28">
			{naming.kind === "rename" ? `in ${parentOf(naming.path)}` : `in ${naming.folder}`}
		</Text>
	</div>
);

const Node: React.FC<{
	entry: FsEntry;
	path: string;
	depth: number;
	open: Set<string>;
	selected: string | null;
	busy: boolean;
	onToggle: (path: string) => void;
	onPick: (selection: Selection) => void;
	onRename: (path: string) => void;
	onDelete: (selection: Selection) => void;
}> = props => {
	const { entry, path, depth, open, selected, busy, onToggle, onPick, onRename, onDelete } = props;
	const expanded = open.has(path);
	return (
		<>
			<div
				role="button"
				tabIndex={0}
				onClick={() => { onPick({ path, dir: entry.dir }); if (entry.dir) onToggle(path); }}
				className={clsx(
					"group w-full flex items-center gap-1.5 py-0.5 pr-2 text-left cursor-pointer hover:bg-hover",
					selected === path && "bg-active",
				)}
				style={{ paddingLeft: 12 + depth * 14 }}
				title={path}
			>
				{entry.dir
					? (expanded ? <ChevronDown size={12} className="shrink-0 text-fg-faint" /> : <ChevronRight size={12} className="shrink-0 text-fg-faint" />)
					: <span className="w-3 shrink-0" />}
				{entry.dir
					? (expanded ? <FolderOpen size={13} className="shrink-0 text-accent-fg" /> : <Folder size={13} className="shrink-0 text-accent-fg" />)
					: <File size={13} className="shrink-0 text-fg-muted" />}
				<Text variant="high" size="xs" className="truncate flex-1">{entry.name}</Text>
				{!entry.dir && <Text variant="low" size="xs" className="tabular-nums shrink-0 group-hover:hidden">{size(entry.size)}</Text>}
				{!busy && (
					<span className="hidden group-hover:flex items-center gap-1 shrink-0">
						<button type="button" title="Rename or move" className="p-0.5 rounded hover:bg-active" onClick={e => { e.stopPropagation(); onRename(path); }}>
							<Pencil size={11} className="text-fg-muted" />
						</button>
						<button type="button" title={entry.dir ? "Delete the folder and all in it" : "Delete"} className="p-0.5 rounded hover:bg-active" onClick={e => { e.stopPropagation(); onDelete({ path, dir: entry.dir }); }}>
							<Trash2 size={11} className="text-danger" />
						</button>
					</span>
				)}
			</div>
			{entry.dir && expanded && entry.children?.map(child => (
				<Node key={child.name} {...props} entry={child} path={join(path, child.name)} depth={depth + 1} />
			))}
		</>
	);
};

/**
 * The selected board's files: the tree from /, with sizes and how full the
 * filesystem is — and everything done to them: open a file (text in an
 * editor, saved back; anything else as hex), download it, upload files (the
 * button, or dropped on the tree), make files and folders, rename or move,
 * delete. Through the board's REPL: each operation pauses its program for a
 * moment, and waits if something else has the board. `visible`: it stays
 * mounted while another tab shows, keeping what it read and what's being edited.
 */
export const FilesPanel: React.FC<{ visible: boolean }> = ({ visible }) => {

	const driver = useAtomValue(DriverConnectionAtom);
	const device = useAtomValue(DeviceSelectionAtom);
	const workflow = useAtomValue(WorkflowAtom);

	const [listing, setListing] = useState<FsListOut | null>(null);
	// What's being done right now — one operation at a time, the board takes one.
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState<Set<string>>(new Set());
	const [selected, setSelected] = useState<Selection | null>(null);
	const [file, setFile] = useState<FsReadOut | null>(null);
	// The open text file as edited — null when it isn't one (binary, cut, nothing open).
	const [draft, setDraft] = useState<string | null>(null);
	const [naming, setNaming] = useState<Naming | null>(null);
	const [dropping, setDropping] = useState(false);
	const uploadRef = useRef<HTMLInputElement>(null);
	const saveRef = useRef<() => void>(() => {});

	const unavailable = !driver ? "Connect a driver" : !device ? "Pick a board" : !workflow ? "Open a workflow" : null;
	const target = driver && device && workflow ? { driverId: driver.id, workflowId: workflow.id, port: device.port } : null;

	const contents = useMemo(() => {
		if (!file) return null;
		const bytes = decode(file.data);
		const text = file.truncated ? null : asText(bytes);
		return text !== null ? { kind: "text" as const, text, bytes } : { kind: "binary" as const, text: hexDump(bytes.subarray(0, HEX_PREVIEW)), bytes };
	}, [file]);
	const dirty = contents?.kind === "text" && draft !== null && draft !== contents.text;

	// Runs one operation on the board: busy meanwhile, its error shown, the tree it answers kept.
	const run = useCallback(async <T,>(label: string, operation: () => Promise<T>): Promise<T | null> => {
		setBusy(label);
		setError(null);
		try {
			return await operation();
		} catch (err) {
			setError(reasonOf(err));
			return null;
		} finally {
			setBusy(null);
		}
	}, []);

	const refresh = useCallback(async () => {
		if (!target) return;
		const out = await run("Reading the board…", () => listBoardFiles(target.driverId, target.workflowId, target.port));
		if (out) setListing(out);
	}, [target?.driverId, target?.workflowId, target?.port, run]);

	// Read once, the first time it shows for this board.
	const [readFor, setReadFor] = useState<string | null>(null);
	useEffect(() => {
		const key = target ? `${target.driverId}:${target.port}` : null;
		if (!visible || !key || key === readFor) return;
		setReadFor(key);
		setListing(null);
		setFile(null);
		setDraft(null);
		setSelected(null);
		void refresh();
	}, [visible, target, readFor, refresh]);

	const confirmDiscard = () => !dirty || window.confirm(`${selected?.path} has unsaved changes — discard them?`);

	const openFile = async (path: string) => {
		if (!target) return;
		setFile(null);
		setDraft(null);
		const out = await run(`Reading ${path}…`, () => readBoardFile(target.driverId, target.workflowId, target.port, path));
		if (!out) return;
		setFile(out);
		const text = out.truncated ? null : asText(decode(out.data));
		setDraft(text);
	};

	const pick = (selection: Selection) => {
		if (selection.path === selected?.path) return;
		if (!selection.dir && !confirmDiscard()) return;
		setSelected(selection);
		if (!selection.dir) void openFile(selection.path);
	};

	const toggle = (path: string) => setOpen(prev => {
		const next = new Set(prev);
		if (next.has(path)) next.delete(path); else next.add(path);
		return next;
	});

	// Where a new file, folder or upload goes: the folder picked, or the picked file's.
	const folder = !selected ? "/" : selected.dir ? selected.path : parentOf(selected.path);

	const save = async () => {
		if (!target || !file || draft === null || !dirty) return;
		const blob = new Blob([draft]);
		if (blob.size > MAX_WRITE) return setError(`Files go up to ${size(MAX_WRITE)}`);
		const out = await run(`Saving ${file.path}…`, () => writeBoardFile(target.driverId, target.workflowId, target.port, file.path, blob));
		if (!out) return;
		setListing(out);
		// What's on the board now is what was saved.
		const bytes = new TextEncoder().encode(draft);
		setFile({ path: file.path, size: bytes.length, data: encode(bytes), truncated: false });
	};
	saveRef.current = () => { void save(); };

	const upload = async (files: FileList | File[]) => {
		if (!target || !listing) return;
		// The tree as each upload leaves it — the next one checks against that.
		let tree = listing.tree;
		for (const picked of Array.from(files)) {
			const path = join(folder, picked.name);
			if (picked.size > MAX_WRITE) { setError(`${picked.name} is ${size(picked.size)} — files go up to ${size(MAX_WRITE)}`); continue; }
			const there = find(tree, path);
			if (there?.dir) { setError(`A folder is called ${picked.name} there already`); continue; }
			if (there && !window.confirm(`${path} is on the board already — replace it?`)) continue;
			const out = await run(`Uploading ${picked.name} (${size(picked.size)})…`, () => writeBoardFile(target.driverId, target.workflowId, target.port, path, picked));
			if (!out) return;
			tree = out.tree;
			setListing(out);
			setOpen(prev => new Set(prev).add(folder));
			if (selected?.path === path) void openFile(path);
		}
	};

	const remove = async (selection: Selection) => {
		if (!target) return;
		const what = selection.dir ? `the folder ${selection.path} and everything in it` : selection.path;
		const warning = isSystem(selection.path)
			? "\n\nIt's part of the Henglos runtime on the board — without it the board may not work until you Flash it again (or, for /components and /files, the next Play puts them back)."
			: "";
		if (!window.confirm(`Delete ${what}? This can't be undone.${warning}`)) return;
		const out = await run(`Deleting ${selection.path}…`, () => deleteBoardFile(target.driverId, target.workflowId, target.port, selection.path));
		if (!out) return;
		setListing(out);
		if (selected && (selected.path === selection.path || selected.path.startsWith(selection.path + "/"))) {
			setSelected(null);
			setFile(null);
			setDraft(null);
		}
	};

	const finishNaming = async (ok: boolean) => {
		const current = naming;
		setNaming(null);
		if (!ok || !current || !target || !listing) return;
		const value = current.value.trim();

		if (current.kind === "rename") {
			// A name renames in place; a path (with /) moves it — relative to its folder, or from / when it starts with one.
			if (!value || value === nameOf(current.path)) return;
			const to = value.startsWith("/") ? value : join(parentOf(current.path), value);
			if (value.split("/").filter(Boolean).some(part => !validName(part))) return setError(`"${value}" isn't a valid name`);
			if (isSystem(current.path) && !window.confirm(`${current.path} is part of the Henglos runtime — move it anyway?`)) return;
			const out = await run(`Renaming ${current.path}…`, () => renameBoardFile(target.driverId, target.workflowId, target.port, current.path, to));
			if (!out) return;
			setListing(out);
			if (selected && (selected.path === current.path || selected.path.startsWith(current.path + "/"))) {
				const moved = to + selected.path.slice(current.path.length);
				setSelected({ ...selected, path: moved });
				if (file) setFile({ ...file, path: moved });
			}
			return;
		}

		if (!validName(value)) return value ? setError(`"${value}" isn't a valid name`) : undefined;
		const path = join(current.folder, value);
		if (find(listing.tree, path)) return setError(`${path} is on the board already`);
		const out = current.kind === "folder"
			? await run(`Making ${path}…`, () => makeBoardFolder(target.driverId, target.workflowId, target.port, path))
			: await run(`Making ${path}…`, () => writeBoardFile(target.driverId, target.workflowId, target.port, path, new Blob([])));
		if (!out) return;
		setListing(out);
		setOpen(prev => new Set(prev).add(current.folder));
		if (current.kind === "folder") setOpen(prev => new Set(prev).add(path));
		else {
			setSelected({ path, dir: false });
			setFile({ path, size: 0, data: "", truncated: false });
			setDraft("");
		}
	};

	const download = () => {
		if (!file || !contents) return;
		const url = URL.createObjectURL(new Blob([contents.bytes.slice()]));
		const link = document.createElement("a");
		link.href = url;
		link.download = nameOf(file.path) || "file";
		link.click();
		URL.revokeObjectURL(url);
	};

	const onEditorMount: OnMount = (editor, monaco: Monaco) => {
		// Ctrl/Cmd+S saves to the board, not the page.
		editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
	};

	const used = listing ? listing.total - listing.free : 0;
	const blocked = !!unavailable || !!busy || !listing;

	return (
		<div className="w-full h-full flex flex-col overflow-hidden">

			<div className="flex items-center justify-between px-4 py-2 shrink-0 gap-4">
				<div className="flex items-center gap-3 min-w-0">
					<Text variant="dim" size="md">Files</Text>
					{listing && (
						<div className="flex items-center gap-2" title={`${size(listing.free)} free of ${size(listing.total)}`}>
							<div className="w-24 h-1.5 rounded-full bg-line overflow-hidden">
								<div className="h-full bg-accent" style={{ width: `${Math.min(100, (used / listing.total) * 100)}%` }} />
							</div>
							<Text variant="low" size="xs" className="tabular-nums">{size(used)} / {size(listing.total)}</Text>
						</div>
					)}
					{busy
						? <Text variant="low" size="xs" className="flex items-center gap-1.5 truncate"><Loader2 size={11} className="animate-spin shrink-0" />{busy}</Text>
						: error && <Text variant="dim" size="xs" className="text-danger truncate" title={error}>{error}</Text>}
				</div>
				<div className="flex items-center gap-0.5 shrink-0">
					<Button.Root variant="ghost" onClick={() => setNaming({ kind: "file", folder, value: "" })} disabled={blocked} title={`New file in ${folder}`}>
						<Button.Icon><FilePlus size={12} /></Button.Icon>
					</Button.Root>
					<Button.Root variant="ghost" onClick={() => setNaming({ kind: "folder", folder, value: "" })} disabled={blocked} title={`New folder in ${folder}`}>
						<Button.Icon><FolderPlus size={12} /></Button.Icon>
					</Button.Root>
					<Button.Root variant="ghost" onClick={() => uploadRef.current?.click()} disabled={blocked} title={`Upload files to ${folder} — or drop them on the tree`}>
						<Button.Icon><Upload size={12} /></Button.Icon>
					</Button.Root>
					<input ref={uploadRef} type="file" multiple hidden onChange={e => { if (e.target.files) void upload(e.target.files); e.target.value = ""; }} />
					<Button.Root variant="ghost" onClick={refresh} disabled={!!unavailable || !!busy} title={unavailable ?? "Read the board's files again — its program pauses for a moment"}>
						<Button.Icon><RefreshCw size={12} /></Button.Icon>
						<Button.Label>Refresh</Button.Label>
					</Button.Root>
				</div>
			</div>

			<div className="flex-1 min-h-0 flex border-t border-line-subtle">

				<div
					className={clsx("w-72 shrink-0 overflow-y-auto border-r border-line-subtle py-1", dropping && "bg-accent-subtle")}
					onDragOver={e => { if (!blocked && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropping(true); } }}
					onDragLeave={() => setDropping(false)}
					onDrop={e => { e.preventDefault(); setDropping(false); if (!blocked) void upload(e.dataTransfer.files); }}
					onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
				>
					{naming && naming.kind !== "rename" && (
						<NameInput naming={naming} onChange={value => setNaming({ ...naming, value })} onDone={ok => void finishNaming(ok)} />
					)}
					{unavailable ? (
						<Text variant="low" size="xs" className="px-4 py-2 block">{unavailable} to see its files.</Text>
					) : !listing ? (
						<Text variant="low" size="xs" className="px-4 py-2 block">{busy ? "Reading the board…" : "Nothing read yet."}</Text>
					) : listing.tree.length === 0 ? (
						<Text variant="low" size="xs" className="px-4 py-2 block">The board's filesystem is empty.</Text>
					) : listing.tree.map(entry => (
						<Node
							key={entry.name}
							entry={entry}
							path={`/${entry.name}`}
							depth={0}
							open={open}
							selected={selected?.path ?? null}
							busy={!!busy}
							onToggle={toggle}
							onPick={pick}
							onRename={path => setNaming({ kind: "rename", path, value: nameOf(path) })}
							onDelete={selection => void remove(selection)}
						/>
					))}
					{naming?.kind === "rename" && (
						<NameInput naming={naming} onChange={value => setNaming({ ...naming, value })} onDone={ok => void finishNaming(ok)} />
					)}
				</div>

				<div className="flex-1 min-w-0 flex flex-col">
					{selected && !selected.dir && (
						<div className="flex items-center justify-between px-4 py-1.5 shrink-0 border-b border-line-subtle gap-3">
							<Text variant="dim" size="xs" className="font-mono truncate" title={selected.path}>
								{selected.path}{dirty ? " ●" : ""}
							</Text>
							<div className="flex items-center gap-1 shrink-0">
								{file && (
									<Text variant="low" size="xs" className="tabular-nums mr-1">
										{size(file.size)}{contents?.kind === "binary" ? (file.truncated ? " · first 128 KB, read-only" : " · binary, read-only") : ""}
									</Text>
								)}
								{contents?.kind === "text" && (
									<>
										<Button.Root variant="ghost" onClick={() => setDraft(contents.text)} disabled={!dirty || !!busy} title="Undo the changes not saved">
											<Button.Icon><RotateCcw size={12} /></Button.Icon>
										</Button.Root>
										<Button.Root variant="ghost" onClick={() => void save()} disabled={!dirty || !!busy} title="Save to the board (Ctrl+S)">
											<Button.Icon><Save size={12} /></Button.Icon>
											<Button.Label>Save</Button.Label>
										</Button.Root>
									</>
								)}
								<Button.Root variant="ghost" onClick={download} disabled={!file} title={file?.truncated ? "Download — only the first 128 KB" : "Download"}>
									<Button.Icon><Download size={12} /></Button.Icon>
								</Button.Root>
							</div>
						</div>
					)}
					<div className="flex-1 min-h-0 overflow-auto">
						{!selected || selected.dir ? (
							<Text variant="low" size="xs" className="px-4 py-2 block">
								{selected?.dir ? `${selected.path} — new files, folders and uploads go here.` : "Pick a file to see or edit what's in it."}
							</Text>
						) : !file ? (
							<Text variant="low" size="xs" className="px-4 py-2 block">{busy ?? "Couldn't read it."}</Text>
						) : contents?.kind === "text" && draft !== null ? (
							<Editor
								path={`board://${selected.path}`}
								language={languageOf(selected.path)}
								value={draft}
								onChange={value => setDraft(value ?? "")}
								theme={HENGLOS_MONACO_THEME}
								beforeMount={defineHenglosMonacoTheme}
								onMount={onEditorMount}
								options={{
									minimap: { enabled: false },
									fontSize: 12,
									scrollBeyondLastLine: false,
									automaticLayout: true,
									readOnly: !!busy,
								}}
							/>
						) : contents && (
							<pre className="px-4 py-2 font-mono text-xs text-fg whitespace-pre">
								{contents.text}
								{contents.bytes.length > HEX_PREVIEW && `\n… ${size(contents.bytes.length - HEX_PREVIEW)} more — download it for the rest`}
							</pre>
						)}
					</div>
				</div>

			</div>

		</div>
	);

};
