import { injectable } from "tsyringe";
import type { TaskType } from "@henglosio/shared";

import type { ITaskCommand } from "../../domain/interfaces/ICommand.interface.js";
import { CompileTaskCommand } from "./CompileTask.command.js";
import { FlashTaskCommand } from "./FlashTask.command.js";
import { ExecuteTaskCommand } from "./ExecuteTask.command.js";
import { RecordTaskCommand } from "./RecordTask.command.js";
import { ReplTaskCommand } from "./ReplTask.command.js";
import { FsTaskCommand } from "./FsTask.command.js";

/** Every task command, by type — what TaskManager looks a `task:start` up in. */
@injectable()
export class TaskCommandRegistry {

	constructor(
		readonly compile: CompileTaskCommand,
		readonly flash: FlashTaskCommand,
		readonly execute: ExecuteTaskCommand,
		readonly record: RecordTaskCommand,
		readonly repl: ReplTaskCommand,
		readonly fs: FsTaskCommand,
	) {}

	get(type: TaskType): ITaskCommand {
		switch (type) {
			case "compile": return this.compile;
			case "flash":   return this.flash;
			case "execute": return this.execute;
			case "record":  return this.record;
			case "repl":    return this.repl;
			case "fs":      return this.fs;
		}
	}

}
