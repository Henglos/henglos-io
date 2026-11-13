import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { createInterface } from "readline";
import path from "path";
import { fileURLToPath } from "url";
import { SerialPortMock } from "serialport";

import { ReplSession } from "../../src/daemon/application/services/ReplSession.service.js";

const FAKE_BOARD = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "fake_board.py");

// A board on the other end of a mock serial port: speaks the raw REPL
// protocol and runs each code block in fake_board.py — the real runtime.
export class FakeBoard {

	private raw = false;
	private code = Buffer.alloc(0);
	private readonly python: ChildProcessWithoutNullStreams;
	private readonly replies: ((reply: { out: string; err: string }) => void)[] = [];
	private queue = Promise.resolve();
	resets = 0;
	/** Every code block the board ran, in order. */
	readonly ran: string[] = [];

	constructor(readonly sandbox: string) {
		this.python = spawn("python", [FAKE_BOARD, sandbox]);
		createInterface({ input: this.python.stdout }).on("line", line => this.replies.shift()?.(JSON.parse(line)));
	}

	attach(port: SerialPortMock): void {
		const binding = port.port!;
		const write = binding.write.bind(binding);
		binding.write = async (data: Buffer) => {
			await write(data);
			this.queue = this.queue.then(() => this.receive(data, d => binding.emitData(d)));
		};
	}

	private async receive(data: Buffer, emit: (data: Buffer) => void): Promise<void> {
		for (const byte of data) {
			if (!this.raw) {
				if (byte === 0x01) { this.raw = true; emit(Buffer.from("raw REPL; CTRL-B to exit\r\n>")); }
				else if (byte === 0x04) this.resets++;
				continue;
			}
			if (byte === 0x01) { this.code = Buffer.alloc(0); emit(Buffer.from("raw REPL; CTRL-B to exit\r\n>")); continue; }
			if (byte === 0x02) { this.raw = false; continue; }
			if (byte === 0x03) continue;
			if (byte !== 0x04) { this.code = Buffer.concat([this.code, Buffer.from([byte])]); continue; }

			const code = this.code.toString("utf-8");
			this.code = Buffer.alloc(0);
			this.ran.push(code);
			// Like a real board: "OK" as soon as the code is in, the output
			// only once it finished running.
			emit(Buffer.from("OK"));
			const reply = await new Promise<{ out: string; err: string }>(resolve => {
				this.replies.push(resolve);
				this.python.stdin.write(JSON.stringify({ code }) + "\n");
			});
			emit(Buffer.concat([Buffer.from(reply.out), Buffer.from([0x04]), Buffer.from(reply.err), Buffer.from([0x04]), Buffer.from(">")]));
		}
	}

	stop(): void { this.python.kill(); }

}

/** A ReplSession to `board`, over a mock port (create "/dev/fake" first). */
export const openFake = (board: FakeBoard) => ReplSession.open("/dev/fake", 5000, options => {
	const port = new SerialPortMock(options);
	port.on("open", () => board.attach(port));
	return port;
});
