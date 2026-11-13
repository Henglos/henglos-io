import { injectable } from "tsyringe";
import { OutputId, parseResponse, type BoardInstall } from "@henglosio/shared";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { ReplSession } from "../../services/ReplSession.service.js";
import { BoardInstaller } from "../../services/BoardInstaller.service.js";
import { createLogger } from "../../../infrastructure/logger/Logger.js";

const log = createLogger("record");

const isAbortError = (err: unknown): boolean => err instanceof Error && err.name === "AbortError";

// Pushes a Record frame sequence (ERASE_RECORD, one RECORD per action,
// FINISH_RECORD — built by hosting) to the board through its REPL, one frame
// at a time, checking each answer: the firmware answers FALLBACK for an action
// it couldn't store (a STREAM config, or the program past MAX_RECORD_SIZE), and
// that fails the task right there instead of leaving a silently truncated
// program. Closing soft-resets the board, so main.py plays the new program.
@injectable()
export class RecordWorkflowUseCase {

	constructor(private readonly installer: BoardInstaller) {}

	async execute(port: string, _baudrate: number, frames: Uint8Array[], ctx: TaskContext, install?: BoardInstall): Promise<boolean> {

		log.info(`Opening ${port} (${frames.length} frame(s))`);
		const repl = await ReplSession.open(port);
		let restart = false;

		try {

			// The stored program plays on its own after this — what it uses
			// has to be on the board: installed first.
			if (install) {
				// A cancel closes the REPL under the install, which then fails.
				const onAbortInstall = () => { void repl.close(false); };
				ctx.signal.addEventListener("abort", onAbortInstall, { once: true });
				try {
					await this.installer.sync(repl, install, ctx);
				} finally {
					ctx.signal.removeEventListener("abort", onAbortInstall);
				}
			}

			for (let i = 0; i < frames.length; i++) {

				if (ctx.signal.aborted) throw new DOMException("aborted", "AbortError");
				ctx.progress("record", Math.round((i / frames.length) * 100));

				const { response } = await repl.exchange(frames[i]!, line => log.info(`board: ${line}`));
				const answer = response ? parseResponse(response.payload) : null;

				if (!answer) throw new Error(`No answer for frame ${i + 1}/${frames.length}`);
				if (answer.id === OutputId.ACTION_NOT_FOUND) {
					throw new Error(
						`The board doesn't have the action of frame ${i + 1}/${frames.length} — its component didn't load ` +
						`(see the device log), or the board's runtime is older than the component needs: compile and flash the workflow again.`,
					);
				}
				if (answer.id !== OutputId.SUCCESS) {
					throw new Error(`The board refused frame ${i + 1}/${frames.length} (command 0x${answer.commandId.toString(16)}, id 0x${answer.id.toString(16)})`);
				}

			}

			restart = true;
			ctx.info(`Recorded ${frames.length} frame(s) to ${port}.`);
			return true;

		} catch (err) {
			log.error(`Failed: ${err instanceof Error ? err.message : err}`);
			// Normalise the AbortError to the message TaskManager keys on.
			if (isAbortError(err) || ctx.signal.aborted) throw new Error("aborted");
			throw err;
		} finally {

			// A finished recording restarts the board, so it plays right away.
			await repl.close(restart);
			log.info(`${port} closed`);

		}

	}

}
