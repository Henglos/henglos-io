import type { Device, DriverItem, FsListOut, FsReadOut, PairTokenOut, PortStatusOut, TaskRecord, TaskType } from "@henglosio/shared";
import { http } from "@shared/lib/http";

export const generateDriverPairToken = async (): Promise<PairTokenOut> => {
	const { data } = await http.get<PairTokenOut>("/drivers/pair-token");
	return data;
};

export const registerDriver = async (hwid: string): Promise<string> => {
	const { data } = await http.post<{ apiKey: string }>("/drivers/register", { hwid });
	return data.apiKey;
};

export const loginDriver = async (hwid: string, apiKey: string): Promise<string> => {
	const { data } = await http.post<{ token: string }>("/drivers/login", { hwid, apiKey });
	return data.token;
};

export const listDrivers = async (): Promise<DriverItem[]> => {
	const { data } = await http.get<{ drivers: DriverItem[] }>("/drivers");
	return data.drivers;
};

export const deleteDriver = async (id: string): Promise<void> => {
	await http.delete(`/drivers/${id}`);
};

/** Restarts the driver's process — what it was running ends; it's back online in a few seconds. */
export const restartDriver = async (id: string): Promise<void> => {
	await http.post(`/drivers/${id}/restart`);
};

export const compileWorkflow = async (driverId: string, workflowId: string): Promise<string> => {
	const { data } = await http.get<{ id: string }>(`/drivers/${driverId}/workflows/${workflowId}/compile`);
	return data.id;
};

export const listDevices = async (driverId: string): Promise<Device[]> => {
	const { data } = await http.get<{ devices: Device[] }>(`/drivers/${driverId}/devices`);
	return data.devices;
};

export const flashWorkflow = async (
	driverId: string,
	workflowId: string,
	port: string,
	baudrate: number,
): Promise<string> => {
	const { data } = await http.post<{ id: string }>(
		`/drivers/${driverId}/workflows/${workflowId}/flash`,
		{ port, baudrate },
	);
	return data.id;
};

export const executeWorkflow = async (
	driverId: string,
	workflowId: string,
	port: string,
	baudrate: number,
): Promise<string> => {
	const { data } = await http.post<{ id: string }>(
		`/drivers/${driverId}/workflows/${workflowId}/execute`,
		{ port, baudrate },
	);
	return data.id;
};

export const recordWorkflow = async (
	driverId: string,
	workflowId: string,
	port: string,
	baudrate: number,
): Promise<string> => {
	const { data } = await http.post<{ id: string }>(
		`/drivers/${driverId}/workflows/${workflowId}/record`,
		{ port, baudrate },
	);
	return data.id;
};

/** Opens a terminal on the board's REPL — its id; the bytes go over the app socket (see ReplPanel). */
export const startRepl = async (driverId: string, workflowId: string, port: string): Promise<string> => {
	const { data } = await http.post<{ id: string }>(`/drivers/${driverId}/workflows/${workflowId}/repl`, { port });
	return data.id;
};

/** The board's file tree, with sizes and the free space. Pauses the board's program for a moment. */
export const listBoardFiles = async (driverId: string, workflowId: string, port: string): Promise<FsListOut> =>
	(await http.get<FsListOut>(`/drivers/${driverId}/workflows/${workflowId}/fs`, { params: { port } })).data;

/** One of the board's files — base64, cut past 128 KB (`truncated`). */
export const readBoardFile = async (driverId: string, workflowId: string, port: string, path: string): Promise<FsReadOut> =>
	(await http.get<FsReadOut>(`/drivers/${driverId}/workflows/${workflowId}/fs/file`, { params: { port, path } })).data;

// The changes to the board's files — each answers the tree as it is after it.

/** Writes `data` to `path` on the board (an upload, an edit saved) — its folders made. Up to 512 KB. */
export const writeBoardFile = async (driverId: string, workflowId: string, port: string, path: string, data: Blob): Promise<FsListOut> => {
	const form = new FormData();
	form.append("file", data, path.split("/").pop() || "file");
	return (await http.post<FsListOut>(`/drivers/${driverId}/workflows/${workflowId}/fs/file`, form, { params: { port, path }, timeout: 330_000 })).data;
};

/** Deletes a file, or a folder with everything in it. */
export const deleteBoardFile = async (driverId: string, workflowId: string, port: string, path: string): Promise<FsListOut> =>
	(await http.post<FsListOut>(`/drivers/${driverId}/workflows/${workflowId}/fs/delete`, { port, path })).data;

/** Makes a folder, and the missing ones above it. */
export const makeBoardFolder = async (driverId: string, workflowId: string, port: string, path: string): Promise<FsListOut> =>
	(await http.post<FsListOut>(`/drivers/${driverId}/workflows/${workflowId}/fs/mkdir`, { port, path })).data;

/** Renames or moves a file or folder — never over something. */
export const renameBoardFile = async (driverId: string, workflowId: string, port: string, path: string, to: string): Promise<FsListOut> =>
	(await http.post<FsListOut>(`/drivers/${driverId}/workflows/${workflowId}/fs/rename`, { port, path, to })).data;

// One stop route per operation type — mirrors the driver.controller.ts split
// (`.../tasks/compile/:taskId/stop`, `.../flash/:taskId/stop`, ...).
export const stopTask = async (driverId: string, type: TaskType, taskId: string): Promise<TaskRecord> => {
	const { data } = await http.post<TaskRecord>(`/drivers/${driverId}/tasks/${type}/${taskId}/stop`);
	return data;
};

/** Frees the board on `port`, whatever is holding it. */
export const releasePort = async (driverId: string, port: string): Promise<PortStatusOut> => {
	const { data } = await http.post<PortStatusOut>(`/drivers/${driverId}/ports/release`, null, { params: { port } });
	return data;
};

/** What has the board on `port` busy — no tasks when it's free. */
export const getPortStatus = async (driverId: string, port: string): Promise<PortStatusOut> => {
	const { data } = await http.get<PortStatusOut>(`/drivers/${driverId}/ports/status`, { params: { port } });
	return data;
};

export type RunActionResult = {
	taskId: string;
	/** The output the action ended on (Success, Fallback, a custom one). */
	output: { id: number; name: string };
	/** What it published, by its outputSchema names — decoded, with the raw bytes. */
	/** `type`: its outputSchema shape as words; a list or an object comes decoded. */
	values: { name: string; type?: string; value: number | boolean | string | number[] | unknown[] | Record<string, unknown>; bytes: number[] }[];
};

/** The ▶ on a node: runs that one action on the board, outside the flow, and waits for it. */
export const runAction = async (
	driverId: string,
	workflowId: string,
	actionId: string,
	port: string,
	baudrate: number,
): Promise<RunActionResult> => {
	const { data } = await http.post<RunActionResult>(
		`/drivers/${driverId}/workflows/${workflowId}/actions/${encodeURIComponent(actionId)}/run`,
		{ port, baudrate },
	);
	return data;
};

/** A value the debugger writes over what an action published (CONTEXT_SET on the board). */
export type DebugValue =
	| { name: string; kind: "integer"; value: number }
	| { name: string; kind: "float"; value: number }
	| { name: string; kind: "bool"; value: boolean }
	| { name: string; kind: "string"; value: string }
	| { name: string; kind: "bytes"; value: number[] }
	| { name: string; kind: "list"; value: unknown[] }
	| { name: string; kind: "object"; value: Record<string, unknown> };

export type DebugState = {
	sessionId: string;
	/** paused: waiting for Continue. listening: waiting for the trigger it started from to fire. finished: the flow ended. */
	status: "paused" | "listening" | "finished";
	step: number;
	/** The action that just ran, and what it did. */
	ran: { actionId: string; output: { id: number; name: string }; values: RunActionResult["values"] } | null;
	/** What Continue runs next — null when the flow is over. */
	nextActionId: string | null;
};

/** Debug mode: runs Start and pauses before the first action — or, from a trigger (`entryId`), arms it and listens. */
export const debugStart = async (driverId: string, workflowId: string, port: string, baudrate: number, entryId?: string): Promise<DebugState> =>
	(await http.post<DebugState>(`/drivers/${driverId}/workflows/${workflowId}/debug`, { port, baudrate, entryId })).data;

/** Where an open debug session stands — to pick it up again after a reload. `busy` while a step runs. */
export const debugGet = async (driverId: string, sessionId: string): Promise<DebugState & { workflowId: string; entryId: string; busy: boolean }> =>
	(await http.get<DebugState & { workflowId: string; entryId: string; busy: boolean }>(`/drivers/${driverId}/debug/${sessionId}`)).data;

/** Runs the next action and pauses again — while listening, waits a while for the trigger. */
export const debugContinue = async (driverId: string, sessionId: string): Promise<DebugState> =>
	(await http.post<DebugState>(`/drivers/${driverId}/debug/${sessionId}/continue`)).data;

/** Overwrites values the board holds before the next step. */
export const debugSetValues = async (driverId: string, sessionId: string, values: DebugValue[]): Promise<void> => {
	await http.post(`/drivers/${driverId}/debug/${sessionId}/values`, { values });
};

export const debugStop = async (driverId: string, sessionId: string): Promise<void> => {
	await http.post(`/drivers/${driverId}/debug/${sessionId}/stop`);
};
