import zod from "zod";

// ── Task model ────────────────────────────────────────────────────────────────
// A Task is a first-class handle over a long-running driver operation
// (compile / flash / execute / record). Hosting mints the id (see the hosting
// `Task` entity), keys everything on it — the driver-command correlation id AND
// the ContainerTunnel session id — and streams a single `TaskEvent` union back
// to the web client, replacing the old split `logs:<id>` + `workflow:*:result`
// channels.

export const TaskTypeSchema = zod.enum(["compile", "flash", "execute", "record", "repl", "fs"]);

// stopping = cancel requested, waiting for the driver to confirm teardown; it
// then settles to `cancelled`. `queued` is hosting's initial status for a task
// it just created, before the driver's first `task:event` arrives — there's no
// queueing on the driver itself: a run either takes its resource locks right
// away or fails immediately as `failed` with a `resource_busy` error.
export const TaskStatusSchema = zod.enum([
	"queued",
	"running",
	"stopping",
	"succeeded",
	"failed",
	"cancelled",
]);

/** A task as the studio sees it: what, on which workflow and driver, how it's going. */
export const TaskRecordSchema = zod.object({
	id: zod.string(),
	type: TaskTypeSchema,
	workflowId: zod.string(),
	driverId: zod.string(),
	status: TaskStatusSchema,
	createdAt: zod.iso.datetime(),
	startedAt: zod.iso.datetime().optional(),
	finishedAt: zod.iso.datetime().optional(),
	error: zod.string().optional(),
	exitCode: zod.number().optional(),
});

// ── Task event stream (driver -> hosting -> web) ──────────────────────────────
// `seq` is a per-task monotonic counter assigned on the driver: the two driver
// log paths (Docker exec demux + the in-container `hio` CLI's HTTP callback)
// interleave, so the client orders/dedupes by `seq`.

export const TaskLogStreamSchema = zod.enum(["stdout", "stderr", "info"]);

/** One event of a task's stream — a status change, a log line, progress, or its result. */
export const TaskEventSchema = zod.discriminatedUnion("kind", [
	zod.object({
		taskId: zod.string(),
		seq: zod.number(),
		kind: zod.literal("status"),
		status: TaskStatusSchema,
	}),
	zod.object({
		taskId: zod.string(),
		seq: zod.number(),
		kind: zod.literal("log"),
		stream: TaskLogStreamSchema,
		line: zod.string(),
		ts: zod.iso.datetime(),
	}),
	zod.object({
		taskId: zod.string(),
		seq: zod.number(),
		kind: zod.literal("progress"),
		phase: zod.string(),
		pct: zod.number().optional(),
	}),
	zod.object({
		taskId: zod.string(),
		seq: zod.number(),
		kind: zod.literal("result"),
		ok: zod.boolean(),
		data: zod.unknown().optional(),
		error: zod.string().optional(),
		exitCode: zod.number().optional(),
	}),
	// Synthetic marker the hosting registry injects when replayed events were
	// dropped from the ring buffer (so the client can show a gap).
	zod.object({
		taskId: zod.string(),
		seq: zod.number(),
		kind: zod.literal("gap"),
		dropped: zod.number(),
	}),
]);

// ── Start payloads (hosting -> driver) ────────────────────────────────────────
// Per-op payload shapes, mirroring the previous Driver*WorkflowInDTO bodies
// minus the standalone `id` (now `taskId` on the envelope).

export const TaskCompilePayloadSchema = zod.object({
	workflowId: zod.string(),
	// The workflow's platform setting overrides (SystemConfig key → value),
	// applied by the platform's build — see PlatformManifestSchema.settings.
	settings: zod.record(zod.string(), zod.number()).optional(),
	// What the workflow picked for its board's options (the board's `options`, by
	// key), handed to the board's firmware script.
	options: zod.record(zod.string(), zod.union([zod.string(), zod.number(), zod.boolean()])).optional(),
});

// Installs the compiled runtime on the board: flashes the MicroPython
// firmware only if the board lacks it (or runs an incompatible one), then
// uploads the runtime as .mpy files over the REPL. Components aren't part of
// it — every session installs what it uses (see BoardInstallSchema).
export const TaskFlashPayloadSchema = zod.object({
	workflowId: zod.string(),
	port: zod.string(),
	baudrate: zod.number(),
});

// What a session needs on the board — built by the hosting from the workflow
// (ResolveBoardInstall in @henglosio/workflow): only the actions on the
// canvas, by component package, and the files attached to configs. The
// driver adds what the actions' scripts import, compiles them and syncs the
// board's /components and /files before the first frame (BoardInstaller),
// sending only what changed — and the limits the workflow overrides.
export const BoardInstallSchema = zod.object({
	components: zod.array(zod.object({
		name: zod.string(),
		version: zod.string(),
		// Its folder on the board: /components/<module>.
		module: zod.string(),
		actions: zod.array(zod.object({
			// The action's file there: <module>.mpy.
			module: zod.string(),
			// Its source, relative to the package (the manifest's `script`).
			script: zod.string(),
		})),
	})),
	files: zod.array(zod.object({
		path: zod.string(),
		sha256: zod.string(),
		data: zod.instanceof(Uint8Array),
	})),
	// The workflow's overrides of the runtime's limits (the platform manifest's
	// `settings`, checked by the hosting): written to /hio_settings.json, read by
	// the runtime when it starts — no build. Absent from an older hosting: the
	// board's file is left as it is.
	settings: zod.record(zod.string(), zod.number().int()).optional(),
});

/** An `execute` task's payload: the board's port, the first frame, and what to install first. */
export const TaskExecutePayloadSchema = zod.object({
	workflowId: zod.string(),
	port: zod.string(),
	baudrate: zod.number(),
	// Pre-built device frame (STX..ETX) — the driver only forwards the bytes.
	frame: zod.instanceof(Uint8Array),
	// Absent from an older hosting: nothing is installed, the board runs what it has.
	install: BoardInstallSchema.optional(),
});

/** A `record` task's payload: the board's port, every frame to store, and what to install first. */
export const TaskRecordPayloadSchema = zod.object({
	workflowId: zod.string(),
	port: zod.string(),
	baudrate: zod.number(),
	frames: zod.array(zod.instanceof(Uint8Array)),
	install: BoardInstallSchema.optional(),
});

// A terminal on the board's own REPL — the port held, bytes passed both ways
// as they are (see ReplInput/ReplOutput) until it's stopped.
export const TaskReplPayloadSchema = zod.object({
	workflowId: zod.string(),
	port: zod.string(),
});

// The board's files, through its raw REPL: the tree (`list`), one file's
// bytes (`read`), or a change — `write` (`data` to `path`, its folders made),
// `delete` (a file, or a folder with all in it), `mkdir` (with its parents),
// `rename` (`path` to `to`, a move too). Answered in the task's result data:
// FsReadOut for a read, the tree after it (FsListOut) for the rest.
export const TaskFsPayloadSchema = zod.object({
	workflowId: zod.string(),
	port: zod.string(),
	op: zod.enum(["list", "read", "write", "delete", "mkdir", "rename"]),
	path: zod.string().optional(),
	to: zod.string().optional(),
	data: zod.instanceof(Uint8Array).optional(),
});

// Studio -> hosting, for the ops that change the board's files.
export const FsPathInSchema = zod.object({
	port: zod.string().min(1),
	path: zod.string().min(1),
});

/** Renaming / moving a board's file or folder. */
export const FsRenameInSchema = zod.object({
	port: zod.string().min(1),
	path: zod.string().min(1),
	to: zod.string().min(1),
});

/** A file or folder on the board. */
export type FsEntry = {
	name: string;
	dir: boolean;
	/** Bytes — 0 for a folder. */
	size: number;
	children?: FsEntry[];
};

/** The board's file tree, and its free space. */
export type FsListOut = {
	/** The filesystem's size and what's free, in bytes. */
	total: number;
	free: number;
	tree: FsEntry[];
};

/** One of the board's files, base64 — cut at the cap when big. */
export type FsReadOut = {
	path: string;
	/** The whole file's size — `data` stops at the cap when `truncated`. */
	size: number;
	/** Base64. */
	data: string;
	truncated: boolean;
};

/** Hosting -> driver (`task:start`): start a task — its id, its type and its payload. */
export const TaskStartInDTOSchema = zod.discriminatedUnion("type", [
	zod.object({ taskId: zod.string(), type: zod.literal("compile"), payload: TaskCompilePayloadSchema }),
	zod.object({ taskId: zod.string(), type: zod.literal("flash"),   payload: TaskFlashPayloadSchema }),
	zod.object({ taskId: zod.string(), type: zod.literal("execute"), payload: TaskExecutePayloadSchema }),
	zod.object({ taskId: zod.string(), type: zod.literal("record"),  payload: TaskRecordPayloadSchema }),
	zod.object({ taskId: zod.string(), type: zod.literal("repl"),    payload: TaskReplPayloadSchema }),
	zod.object({ taskId: zod.string(), type: zod.literal("fs"),      payload: TaskFsPayloadSchema }),
]);

// The REPL's bytes: what's typed (web -> hosting -> driver, `repl:input`) and
// what the board answers (driver -> hosting, `repl:output`; hosting -> web on
// `repl:<taskId>`).
export const ReplDataSchema = zod.object({
	taskId: zod.string(),
	data: zod.instanceof(Uint8Array),
});

// What the driver has, answered when the hosting asks (`tasks:state`) each time
// it connects: the driver is the source of truth for what runs on it, the
// hosting's task list is rebuilt from this. `finished` is how its latest tasks
// ended, for a hosting that missed the end of one.
export const DriverTasksStateSchema = zod.object({
	running: zod.array(zod.object({
		taskId: zod.string(),
		type: TaskTypeSchema,
		workflowId: zod.string().optional(),
		port: zod.string().optional(),
		startedAt: zod.number(),
	})),
	finished: zod.array(zod.object({
		taskId: zod.string(),
		ok: zod.boolean(),
		error: zod.string().optional(),
	})),
});

/** Hosting -> driver (`task:cancel`): stop a task. */
export const TaskCancelInDTOSchema = zod.object({
	taskId: zod.string(),
});

// ── web <-> hosting ──────────────────────────────────────────────────────────

export const TaskSubscribeInDTOSchema = zod.object({
	taskId: zod.string(),
});

// POST /drivers/:driverId/workflows/:workflowId/repl — opens the terminal.
export const ReplStartInSchema = zod.object({
	port: zod.string().min(1),
});

// ── Inferred types ───────────────────────────────────────────────────────────

export type TaskType = zod.infer<typeof TaskTypeSchema>;
// stopping = cancel requested, waiting for the driver to confirm teardown; it
// then settles to `cancelled`. `queued` is hosting's initial status for a task
// it just created, before the driver's first `task:event` arrives — there's no
// queueing on the driver itself: a run either takes its resource locks right
// away or fails immediately as `failed` with a `resource_busy` error.
export type TaskStatus = zod.infer<typeof TaskStatusSchema>;
/** A task as the studio sees it: what, on which workflow and driver, how it's going. */
export type TaskRecord = zod.infer<typeof TaskRecordSchema>;
// ── Task event stream (driver -> hosting -> web) ──────────────────────────────
// `seq` is a per-task monotonic counter assigned on the driver: the two driver
// log paths (Docker exec demux + the in-container `hio` CLI's HTTP callback)
// interleave, so the client orders/dedupes by `seq`.
export type TaskLogStream = zod.infer<typeof TaskLogStreamSchema>;
/** One event of a task's stream — a status change, a log line, progress, or its result. */
export type TaskEvent = zod.infer<typeof TaskEventSchema>;

// ── Start payloads (hosting -> driver) ────────────────────────────────────────
// Per-op payload shapes, mirroring the previous Driver*WorkflowInDTO bodies
// minus the standalone `id` (now `taskId` on the envelope).
export type TaskCompilePayload = zod.infer<typeof TaskCompilePayloadSchema>;
// Installs the compiled runtime on the board: flashes the MicroPython
// firmware only if the board lacks it (or runs an incompatible one), then
// uploads the runtime as .mpy files over the REPL. Components aren't part of
// it — every session installs what it uses (see BoardInstallSchema).
export type TaskFlashPayload = zod.infer<typeof TaskFlashPayloadSchema>;
/** An `execute` task's payload: the board's port, the first frame, and what to install first. */
export type TaskExecutePayload = zod.infer<typeof TaskExecutePayloadSchema>;
/** A `record` task's payload: the board's port, every frame to store, and what to install first. */
export type TaskRecordPayload = zod.infer<typeof TaskRecordPayloadSchema>;
// A terminal on the board's own REPL — the port held, bytes passed both ways
// as they are (see ReplInput/ReplOutput) until it's stopped.
export type TaskReplPayload = zod.infer<typeof TaskReplPayloadSchema>;
// The board's files, through its raw REPL: the tree (`list`), one file's
// bytes (`read`), or a change — `write` (`data` to `path`, its folders made),
// `delete` (a file, or a folder with all in it), `mkdir` (with its parents),
// `rename` (`path` to `to`, a move too). Answered in the task's result data:
// FsReadOut for a read, the tree after it (FsListOut) for the rest.
export type TaskFsPayload = zod.infer<typeof TaskFsPayloadSchema>;
// Studio -> hosting, for the ops that change the board's files.
export type FsPathIn = zod.infer<typeof FsPathInSchema>;
/** Renaming / moving a board's file or folder. */
export type FsRenameIn = zod.infer<typeof FsRenameInSchema>;
// The REPL's bytes: what's typed (web -> hosting -> driver, `repl:input`) and
// what the board answers (driver -> hosting, `repl:output`; hosting -> web on
// `repl:<taskId>`).
export type ReplData = zod.infer<typeof ReplDataSchema>;
// What a session needs on the board — built by the hosting from the workflow
// (ResolveBoardInstall in @henglosio/workflow): only the actions on the
// canvas, by component package, and the files attached to configs. The
// driver adds what the actions' scripts import, compiles them and syncs the
// board's /components and /files before the first frame (BoardInstaller),
// sending only what changed.
export type BoardInstall = zod.infer<typeof BoardInstallSchema>;

/** Hosting -> driver (`task:start`): start a task — its id, its type and its payload. */
export type TaskStartInDTO = zod.infer<typeof TaskStartInDTOSchema>;
/** Hosting -> driver (`task:cancel`): stop a task. */
export type TaskCancelInDTO = zod.infer<typeof TaskCancelInDTOSchema>;
/** What the driver has running, and how its latest tasks ended. */
export type DriverTasksState = zod.infer<typeof DriverTasksStateSchema>;
// ── web <-> hosting ──────────────────────────────────────────────────────────
export type TaskSubscribeInDTO = zod.infer<typeof TaskSubscribeInDTOSchema>;
// POST /drivers/:driverId/workflows/:workflowId/repl — opens the terminal.
export type ReplStartIn = zod.infer<typeof ReplStartInSchema>;
