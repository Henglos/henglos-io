import { SerialPort } from "serialport";
import { serialLines } from "./SerialLines.js";
import { FrameType, parseDebug, parseFrame, type ParsedFrame } from "@henglosio/shared";

// How the driver talks to a MicroPython board: through its USB REPL, in raw
// mode (the protocol mpremote uses — see packages/hio-system/scripts/repl_link.py
// for the reference implementation). Frames travel as hex inside Python calls
// to hio.tools.repl.exchange, so their ETX (0x03 = Ctrl-C) never reaches the
// wire raw. Files (the runtime, components) are written the same way.
//
//   open    Ctrl-C (stops main.py), Ctrl-A -> "raw REPL; CTRL-B to exit\r\n>"
//   exec    code + Ctrl-D -> "OK" + stdout + \x04 + stderr + \x04 + ">"
//   close   Ctrl-B (normal REPL) + Ctrl-D (soft reset: main.py runs again)

// The REPL's own UART speed on MicroPython's ESP32 port — fixed, unrelated
// to whatever baud the workflow configures for anything else.
export const REPL_BAUDRATE = 115200;

const RAW_REPL_BANNER = Buffer.from("raw REPL; CTRL-B to exit\r\n");
const PROMPT = Buffer.from(">");
const EOT = Buffer.from([0x04]);

// Raw REPL reads its input without flow control: written in small pieces,
// with a pause between them, so the board's input buffer never overflows.
const WRITE_CHUNK = 256;
const WRITE_PAUSE_MS = 10;

// Base64 of one file write per line of the upload command.
const FILE_CHUNK = 512;

/** The board's REPL failed or didn't answer — `stderr`, when there is one, is what the board printed. */
export class ReplError extends Error {
	constructor(message: string, readonly stderr?: string) {
		super(message);
		this.name = "ReplError";
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function pyString(text: string): string {
	return JSON.stringify(text); // a JSON string is a valid Python str literal for paths/hex/base64
}

/** What one exchange of frames got back from the runtime. */
export type ExchangeResult = {
	// Every frame the firmware answered, in order (RESPONSE and DEBUG).
	frames: ParsedFrame[];
	// The first RESPONSE among them, if any.
	response: ParsedFrame | undefined;
};

/**
 * A session on a board's raw REPL, over its serial port (the protocol is above): run code,
 * write and remove files, and exchange frames with the runtime (hio/tools/repl.py).
 */
export class ReplSession {

	private buffer = Buffer.alloc(0);
	private waiter: (() => void) | undefined;
	private exchangeLoaded = false;

	private constructor(private readonly port: SerialPort) {
		port.on("data", (chunk: Buffer) => {
			this.buffer = Buffer.concat([this.buffer, chunk]);
			this.waiter?.();
		});
	}

	// Opens `path` and gets the board into the raw REPL — retrying for a few
	// seconds, since opening the port can reset the board (DTR/RTS) and the
	// REPL only answers once it booted. `createPort`: tests pass a mock.
	static async open(
		path: string,
		timeoutMs = 8000,
		createPort: (options: { path: string; baudRate: number; autoOpen: false }) => SerialPort = options => new SerialPort(options),
	): Promise<ReplSession> {

		const port = await new Promise<SerialPort>((resolve, reject) => {
			const p = createPort({ path, baudRate: REPL_BAUDRATE, autoOpen: false });
			p.open(err => err ? reject(err) : resolve(p));
		});

		const session = new ReplSession(port);

		try {
			// RTS released (it holds EN low on boards with the usual auto-program
			// circuit — a permanent reset); DTR only for a native USB board, whose
			// long answers arrive scrambled without it — see serialLines.
			const lines = await serialLines(path);
			await new Promise<void>(resolve => port.set(lines, () => resolve()));
			await session.enterRaw(timeoutMs);
		} catch (err) {
			await session.closePort();
			throw err;
		}

		return session;

	}

	private async enterRaw(timeoutMs: number): Promise<void> {

		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			// Ctrl-C twice stops main.py (and anything it awaits).
			await this.write(Buffer.from("\r\x03"));
			await sleep(100);
			await this.write(Buffer.from("\r\x03"));
			await sleep(100);
			this.buffer = Buffer.alloc(0);
			await this.write(Buffer.from("\r\x01"));
			try {
				await this.readUntil(Buffer.concat([RAW_REPL_BANNER, PROMPT]), 1000);
				return;
			} catch {
				// not answering yet — still booting, or busy; try again
			}
		}

		throw new ReplError("The board didn't answer on its REPL — is MicroPython running on it?");

	}

	// Runs `code` on the board and returns what it printed. Throws ReplError
	// with the board's traceback if it raised.
	async exec(code: string, timeoutMs = 10000): Promise<string> {

		const bytes = Buffer.from(code, "utf-8");
		for (let i = 0; i < bytes.length; i += WRITE_CHUNK) {
			await this.write(bytes.subarray(i, i + WRITE_CHUNK));
			await sleep(WRITE_PAUSE_MS);
		}
		await this.write(EOT);

		const ok = await this.readExactly(2, timeoutMs);
		if (ok.toString() !== "OK") throw new ReplError(`Unexpected raw REPL answer: ${JSON.stringify(ok.toString())}`);

		const stdout = (await this.readUntil(EOT, timeoutMs)).subarray(0, -1).toString("utf-8");
		const stderr = (await this.readUntil(EOT, timeoutMs)).subarray(0, -1).toString("utf-8");
		await this.readUntil(PROMPT, timeoutMs);

		if (stderr.trim()) throw new ReplError(stderr.trim().split("\n").at(-1) ?? "error on the board", stderr);
		return stdout;

	}

	// ── Frames ────────────────────────────────────────────────────────────────

	// Sends `frames` (STX..ETX, one or several back to back) to the runtime and
	// returns what it answered. See hio/tools/repl.py. An action may hold the
	// board up to a minute on purpose (WiFi Connect, HTTP Request) — same bound
	// as the hosting's RESPONSE_TIMEOUT_MS.
	async exchange(frames: Uint8Array, onDebug?: (line: string) => void, timeoutMs = 75_000): Promise<ExchangeResult> {

		if (!this.exchangeLoaded) {
			await this.exec("from hio.tools.repl import exchange");
			this.exchangeLoaded = true;
		}

		const stdout = await this.exec(`exchange(${pyString(Buffer.from(frames).toString("hex"))})`, timeoutMs);
		const match = /<<([0-9a-f]*)>>/.exec(stdout);
		if (!match) throw new ReplError(`No answer from the runtime: ${JSON.stringify(stdout)}`);

		let data: Uint8Array = Buffer.from(match[1]!, "hex");
		const result: ExchangeResult = { frames: [], response: undefined };

		for (;;) {
			const frame = parseFrame(data);
			if (!frame) break;
			data = data.subarray(frame.consumed);
			result.frames.push(frame);
			if (frame.frameType === FrameType.DEBUG) onDebug?.(parseDebug(frame.payload).message);
			else if (frame.frameType === FrameType.RESPONSE && !result.response) result.response = frame;
		}

		return result;

	}

	// ── Board info ────────────────────────────────────────────────────────────

	// The .mpy version the board's MicroPython imports: [version, sub-version].
	// Null on a build without .mpy support.
	async mpyVersion(): Promise<[number, number] | null> {
		const out = await this.exec("import sys\nprint(getattr(sys.implementation, '_mpy', -1))");
		const value = Number.parseInt(out.trim().split("\n").at(-1) ?? "", 10);
		if (!Number.isFinite(value) || value < 0) return null;
		return [value & 0xff, (value >> 8) & 0x3];
	}

	// ── Files ─────────────────────────────────────────────────────────────────

	// Deletes `path` on the board — file or folder, recursively. Missing is fine.
	async remove(path: string): Promise<void> {
		await this.exec([
			"import os",
			"def _rm(p):",
			"    try: s = os.stat(p)",
			"    except OSError: return",
			"    if s[0] & 0x4000:",
			"        for n in os.listdir(p): _rm(p + '/' + n)",
			"        os.rmdir(p)",
			"    else: os.remove(p)",
			`_rm(${pyString(path)})`,
		].join("\n"), 30000);
	}

	// Creates every folder in `paths` (parents first). Existing ones are fine.
	async mkdirs(paths: string[]): Promise<void> {
		if (paths.length === 0) return;
		await this.exec([
			"import os",
			`for p in ${JSON.stringify(paths)}:`,
			"    try: os.mkdir(p)",
			"    except OSError: pass",
		].join("\n"));
	}

	// Writes `data` to `path` on the board (its folder must exist). The time
	// it may take grows with the size — base64 over the REPL, ~4 KB a second.
	async writeFile(path: string, data: Uint8Array): Promise<void> {
		const lines = [
			"from binascii import a2b_base64 as _b",
			`_f = open(${pyString(path)}, 'wb')`,
		];
		const bytes = Buffer.from(data);
		for (let i = 0; i < bytes.length; i += FILE_CHUNK) {
			lines.push(`_f.write(_b(${pyString(bytes.subarray(i, i + FILE_CHUNK).toString("base64"))}))`);
		}
		lines.push("_f.close()");
		await this.exec(lines.join("\n"), Math.max(30000, bytes.length / 4));
	}

	// ── Closing ───────────────────────────────────────────────────────────────

	// Leaves the raw REPL. `restart`: soft reset, so main.py runs again (and
	// plays the stored program, if there's one).
	async close(restart = true): Promise<void> {
		try {
			await this.write(Buffer.from("\r\x02"));
			if (restart) {
				await sleep(50);
				await this.write(EOT);
				await sleep(200);
			}
		} catch {
			// the port may already be gone — closing it is what matters
		}
		await this.closePort();
	}

	// ── Port ──────────────────────────────────────────────────────────────────

	private write(data: Uint8Array): Promise<void> {
		return new Promise((resolve, reject) => {
			this.port.write(Buffer.from(data), err => err ? reject(err) : this.port.drain(e => e ? reject(e) : resolve()));
		});
	}

	// Waits until the buffer holds `marker`; returns everything up to and
	// including it, and keeps what came after.
	private readUntil(marker: Buffer, timeoutMs: number): Promise<Buffer> {
		return new Promise((resolve, reject) => {

			const check = () => {
				const index = this.buffer.indexOf(marker);
				if (index < 0) return false;
				const end = index + marker.length;
				const head = this.buffer.subarray(0, end);
				this.buffer = this.buffer.subarray(end);
				done();
				resolve(Buffer.from(head));
				return true;
			};

			const timer = setTimeout(() => {
				done();
				reject(new ReplError(`Timed out waiting for the board (${JSON.stringify(marker.toString())})`));
			}, timeoutMs);

			// Only clears its own waiter — never one a later read registered.
			const done = () => {
				clearTimeout(timer);
				if (this.waiter === check) this.waiter = undefined;
			};

			if (!check()) this.waiter = check;

		});
	}

	private async readExactly(count: number, timeoutMs: number): Promise<Buffer> {
		const deadline = Date.now() + timeoutMs;
		while (this.buffer.length < count) {
			const remaining = deadline - Date.now();
			if (remaining <= 0) throw new ReplError("Timed out waiting for the board");
			await this.nextData(remaining);
		}
		const head = this.buffer.subarray(0, count);
		this.buffer = this.buffer.subarray(count);
		return Buffer.from(head);
	}

	// Resolves on the next chunk of data, or after `timeoutMs`.
	private nextData(timeoutMs: number): Promise<void> {
		return new Promise(resolve => {
			const done = () => {
				clearTimeout(timer);
				if (this.waiter === done) this.waiter = undefined;
				resolve();
			};
			const timer = setTimeout(done, timeoutMs);
			this.waiter = done;
		});
	}

	// Awaited, never rejects, never hangs: Windows COM ports are exclusive, so
	// the next task on this port must be able to open it right away. The cap
	// covers a close() callback that never comes (port errored mid-write).
	private closePort(): Promise<void> {
		return new Promise(resolve => {
			if (!this.port.isOpen) return resolve();
			let settled = false;
			const finish = () => { if (settled) return; settled = true; resolve(); };
			const timer = setTimeout(finish, 2000);
			try {
				this.port.close(() => { clearTimeout(timer); finish(); });
			} catch {
				clearTimeout(timer);
				finish();
			}
		});
	}

}
