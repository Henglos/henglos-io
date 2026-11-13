import { SerialPort } from "serialport";
import { injectable } from "tsyringe";
import { TaskContext } from "../../../domain/entities/TaskContext.js";
import { SocketIOClient } from "../../../infrastructure/ws/SocketIOClient.impl.js";
import { REPL_BAUDRATE } from "../../services/ReplSession.service.js";
import { ReplTerminalsService } from "../../services/ReplTerminals.service.js";

// Ctrl-C twice stops main.py (and anything it awaits).
const INTERRUPT = Buffer.from([0x03, 0x03]);
// Ctrl-B: out of a raw REPL a session left behind (its prompt is a bare ">").
const FRIENDLY = Buffer.from([0x02]);
// A return: a fresh prompt, the first thing the terminal shows.
const PROMPT_REQUEST = Buffer.from([0x0d]);
// Ctrl-C clears a half-typed line, Ctrl-D at the prompt soft-resets: main.py
// plays again, as after any session.
const DETACH = Buffer.from([0x03, 0x04]);

// How long the board gets to settle at a prompt after each step of attaching.
const SETTLE_MS = 1500;
// How long closing may take — a port that errored may never call back.
const CLOSE_TIMEOUT_MS = 2000;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * A terminal on the board's own REPL: the friendly one, the way a serial
 * monitor shows it — bytes from the board go out as `repl:output`, what's
 * typed comes in through WriteReplTerminalUseCase. Runs as a task holding the
 * port, so nothing else uses the board meanwhile; ends when the task is
 * cancelled (the studio's Disconnect) or the board goes away.
 */
@injectable()
export class RunReplTerminalUseCase {

	constructor(
		private readonly ws: SocketIOClient,
		private readonly replTerminals: ReplTerminalsService,
	) {}

	async execute(taskId: string, path: string, ctx: TaskContext): Promise<void> {

		const port = await new Promise<SerialPort>((resolve, reject) => {
			const opening = new SerialPort({ path, baudRate: REPL_BAUDRATE, autoOpen: false });
			opening.open(err => err ? reject(err) : resolve(opening));
		});
		this.replTerminals.terminals.set(taskId, port);
		ctx.info(`REPL on ${path} — the board's program is stopped while it's open, and plays again when it closes`);

		try {
			await this.attach(port);

			await new Promise<void>((resolve, reject) => {
				port.on("data", (chunk: Buffer) => {
					this.ws.socket?.emit("repl:output", { taskId, data: new Uint8Array(chunk) });
				});
				// Unplugged, or closed under it.
				port.on("close", () => resolve());
				port.on("error", reject);

				if (ctx.signal.aborted) return resolve();
				ctx.signal.addEventListener("abort", () => resolve(), { once: true });

				port.write(PROMPT_REQUEST);
			});
		} finally {
			this.replTerminals.terminals.delete(taskId);
			await this.close(port);
		}

	}

	/**
	 * Gets the board to its friendly prompt, keeping what it prints on the way
	 * out of the terminal: the stopped program's KeyboardInterrupt traceback
	 * and the banners — noise, not the session. Ctrl-B only if it's sitting in
	 * a raw REPL (Ctrl-B at the friendly prompt prints the banner again).
	 */
	private async attach(port: SerialPort): Promise<void> {

		let seen = "";
		const collect = (chunk: Buffer) => { seen += chunk.toString("latin1"); };
		port.on("data", collect);
		const settled = async () => {
			const start = Date.now();
			while (Date.now() - start < SETTLE_MS && !/(>>> |\r\n>)$/.test(seen)) await sleep(50);
		};

		try {
			// Released lines: an asserted RTS holds EN low on boards with the
			// usual auto-program circuit (a permanent reset).
			await new Promise<void>(resolve => port.set({ dtr: false, rts: false }, () => resolve()));
			port.write(INTERRUPT);
			await settled();
			if (/\r\n>$/.test(seen)) {
				seen = "";
				port.write(FRIENDLY);
				await settled();
			}
		} finally {
			port.off("data", collect);
		}

	}

	private close(port: SerialPort): Promise<void> {
		return new Promise(resolve => {
			if (!port.isOpen) return resolve();
			let settled = false;
			const finish = () => { if (settled) return; settled = true; resolve(); };
			const timer = setTimeout(finish, CLOSE_TIMEOUT_MS);
			try {
				port.write(DETACH, () => port.drain(() => port.close(() => { clearTimeout(timer); finish(); })));
			} catch {
				clearTimeout(timer);
				finish();
			}
		});
	}

}
