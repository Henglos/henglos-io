/**
 * The runner host: what prepares, builds and flashes inside the build container.
 * Built into dist/runner-host.mjs — one self-contained file, no node_modules and
 * nothing native — which the driver (and `hio firmware`) copies into the
 * container and runs with the image's Node. So an image needs Node and its
 * board's tools, not `hio`, and what runs inside is always the version of the
 * driver that asked: the two never disagree on the protocol.
 *
 *   node runner-host.mjs prepare --map runner.map.json [--force] <workspace>
 *   node runner-host.mjs build --map runner.map.json [--output <path>] <workspace>
 *   node runner-host.mjs flash --map runner.map.json [--port <url>] [--method serial|uf2] [--baudrate 460800] [--firmware <path>] <workspace>
 *   node runner-host.mjs compile --map runner.map.json --input <CompileRequest.json> --output <CompileResult.json> <workspace>
 *
 * Progress goes to HIO_CALLBACK_URL when it's set (the driver), to the terminal
 * otherwise. A failure is reported (prepare_failed / build_failed / flash_failed /
 * compile_failed) and exits 1 — a module that doesn't compile isn't one: it's in
 * the CompileResult's errors. The flash erases the board first unless HIO_FLASH_ERASE=0.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { BUILD_OUTPUT, connectDriver, type CompileRequest, type FlashMethodName } from "@henglosio/runner";
import { buildFirmware, compileModules, flashFirmware, prepareFirmware, type FirmwareJob } from "./core/firmware.js";
import { loadBoardFirmware, resolveFromMap } from "./core/runner.js";

declare const __HIO_VERSION__: string;

type Args = { action: string; workspace: string; options: Record<string, string>; flags: Set<string> };

// The options that take no value.
const FLAGS = new Set(["force"]);

// `<action> [--name value | --flag]... <workspace>`.
function parseArgs(argv: string[]): Args {
	const [action = "", ...rest] = argv;
	const options: Record<string, string> = {};
	const flags = new Set<string>();
	const positional: string[] = [];
	for (let i = 0; i < rest.length; i++) {
		const arg = rest[i]!;
		if (!arg.startsWith("--")) {
			positional.push(arg);
			continue;
		}
		const name = arg.slice(2);
		if (FLAGS.has(name)) {
			flags.add(name);
			continue;
		}
		const value = rest[i + 1];
		if (value === undefined) throw new Error(`${arg} needs a value.`);
		options[name] = value;
		i++;
	}
	return { action, workspace: path.resolve(positional[0] ?? "."), options, flags };
}

// --method: how the studio has the firmware written. Absent: serial.
function parseMethod(value: string | undefined): FlashMethodName {
	if (value === undefined || value === "serial" || value === "uf2") return value ?? "serial";
	throw new Error(`Unknown flash method "${value}" — use serial or uf2.`);
}

async function main(): Promise<void> {
	const driver = connectDriver();
	const send = driver.send;
	let action = "";

	try {
		const args = parseArgs(process.argv.slice(2));
		action = args.action;
		if (action !== "prepare" && action !== "build" && action !== "flash" && action !== "compile") {
			throw new Error(`Unknown action "${action}" — use prepare, build, flash or compile.`);
		}
		const map = args.options["map"];
		if (!map) throw new Error("--map is required.");

		await send({ type: "data", data: `[runner] Henglos IO runner host ${__HIO_VERSION__}, Node ${process.version}\n` });
		const { board, platform, components, options } = await resolveFromMap(path.resolve(map));
		const job: FirmwareJob = {
			board,
			boardFirmware: await loadBoardFirmware(board),
			options,
			log: (data) => send({ type: "data", data }),
			phase: (phase) => send({ type: "phase", phase }),
		};

		if (action === "prepare") {
			const { mpyCross } = await prepareFirmware(job, args.flags.has("force"));
			await job.log(`[prepare] ready — mpy-cross: ${mpyCross}\n`);
		} else if (action === "build") {
			await buildFirmware({ ...job, platform, components, output: path.resolve(args.options["output"] ?? BUILD_OUTPUT) });
		} else if (action === "compile") {
			const input = args.options["input"];
			const output = args.options["output"];
			if (!input || !output) throw new Error("--input and --output are required to compile.");
			const request = JSON.parse(await fs.readFile(path.resolve(input), "utf-8")) as CompileRequest;
			const result = await compileModules(job, request);
			await fs.writeFile(path.resolve(output), JSON.stringify(result));
		} else {
			// A UF2 write may have no port: the board is in its bootloader.
			const method = parseMethod(args.options["method"]);
			const port = args.options["port"];
			if (!port && method === "serial") throw new Error("--port is required to flash by serial.");
			const firmware = args.options["firmware"];
			const baudrate = Number(args.options["baudrate"] ?? "460800");
			await flashFirmware({
				...job,
				method,
				baudrate,
				broker: driver.broker(port, baudrate),
				erase: process.env.HIO_FLASH_ERASE !== "0",
				...(firmware ? { firmware: path.resolve(firmware) } : {}),
			});
		}
	} catch (err) {
		await send({ type: "error", id: `${action || "runner"}_failed`, data: err instanceof Error ? err.message : String(err) });
		process.exit(1);
	}
}

await main();
