import { createHash } from "crypto";
import { createRequire } from "module";
import fs from "fs/promises";
import { readFileSync } from "fs";
import os from "os";
import path from "path";
import { injectable } from "tsyringe";

// Compiles MicroPython source to .mpy (ABI v6 — MicroPython 1.19+) on the
// driver, with mpy-cross built to WebAssembly (@pybricks/mpy-cross-v6): no
// Docker, no native tool. What a session installs on the board (see
// BoardInstaller) goes through here.
//
// The package's own compile() lets Emscripten fetch() the .wasm by path,
// which Node's fetch refuses ("unknown scheme") — so its module is called
// directly, handed the .wasm's bytes (wasmBinary).

const require = createRequire(import.meta.url);

// Part of every cache key: a new compiler means new .mpy files.
const COMPILER = "mpy-cross-v6@2.0.0";

type EmscriptenMpyCross = (module: {
	arguments: string[];
	inputFileContents: string;
	wasmBinary: Uint8Array;
	callback: (status: number, mpy: Uint8Array | undefined, out: string[], err: string[]) => void;
}) => void;

/** A component's script didn't compile — the message has mpy-cross's errors. */
export class MpyCompileError extends Error {}

/**
 * Compiles MicroPython modules to .mpy with mpy-cross (its WebAssembly build — nothing to
 * install), cached by content in ~/.henglos/io/driver/mpy-cache.
 */
@injectable()
export class MpyCompiler {

	/** The ABI the .mpy files are for — a board must import this major version. */
	static readonly ABI = 6;

	private readonly cacheDir = path.join(os.homedir(), ".henglos", "io", "driver", "mpy-cache");
	private runtime: { mpyCross: EmscriptenMpyCross; wasmBinary: Uint8Array } | null = null;

	private load() {
		if (!this.runtime) {
			const root = path.dirname(require.resolve("@pybricks/mpy-cross-v6/package.json"));
			this.runtime = {
				mpyCross: require(path.join(root, "build", "mpy-cross-v6.js")) as EmscriptenMpyCross,
				wasmBinary: readFileSync(path.join(root, "build", "mpy-cross-v6.wasm")),
			};
		}
		return this.runtime;
	}

	/**
	 * `source` as .mpy. `name`: the path tracebacks on the board show
	 * (components/display/print.py). Cached on disk by source + name + compiler.
	 * Throws MpyCompileError with mpy-cross's message (a syntax error).
	 */
	async compile(name: string, source: string): Promise<Uint8Array> {

		const key = createHash("sha256").update(`${COMPILER}\0${name}\0${source}`).digest("hex");
		const cached = path.join(this.cacheDir, `${key}.mpy`);
		const hit = await fs.readFile(cached).catch(() => null);
		if (hit) return new Uint8Array(hit);

		const { mpyCross, wasmBinary } = this.load();
		const file = path.posix.basename(name);
		const result = await new Promise<{ status: number; mpy?: Uint8Array; err: string[] }>((resolve, reject) => {
			try {
				mpyCross({
					arguments: ["-s", name, file],
					inputFileContents: source,
					wasmBinary,
					callback: (status, mpy, _out, err) => resolve({ status, mpy, err }),
				});
			} catch (error) {
				reject(error);
			}
		});

		if (result.status !== 0 || !result.mpy) {
			throw new MpyCompileError(`${name}: ${result.err.join("\n").trim() || `mpy-cross exited with ${result.status}`}`);
		}

		await fs.mkdir(this.cacheDir, { recursive: true });
		await fs.writeFile(cached, result.mpy).catch(() => {});
		return result.mpy;

	}

}
