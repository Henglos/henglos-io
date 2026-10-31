import type { TaskType } from "@henglosio/shared";
import { TaskContext } from "../entities/TaskContext.js";

/**
 * A long-running driver operation, run and tracked by the TaskManager. The 4
 * task ops (compile / flash / execute / record) implement this; the plain
 * request/response ops (sync / create / delete / removePackage / listDevices)
 * do not.
 */
export interface ITaskCommand<TPayload = unknown, TResult = unknown> {

	readonly type: TaskType;

	isValidPayload(payload: unknown): payload is TPayload;

	/**
	 * Resource lock keys this run needs — the TaskManager serialises on these
	 * (`workflow:<id>` for the per-workflow build container, `port:<path>` for a
	 * serial port). A run that can't take its locks sits `queued`. Async so a
	 * command can decide its keys from live state (e.g. flash only needs the
	 * workflow lock while the workflow isn't compiled yet).
	 */
	locks(payload: TPayload): string[] | Promise<string[]>;

	execute(payload: TPayload, ctx: TaskContext): Promise<TResult>;

}
