/**
 * The runner host: what runs the platform's Runner inside the build container.
 * Built into dist/runner-host.mjs — one self-contained file, no node_modules and
 * nothing native — which the driver (and `hio firmware`) copies into the
 * container and runs with the image's Node. So an image needs Node, Python and
 * its board's tools, not `hio`, and what runs inside is always the version of
 * the driver that asked: the two never disagree on the protocol.
 *
 *   node runner-host.mjs build --map runner.map.json <workspace>
 *   node runner-host.mjs flash --map runner.map.json --port <url> [--baudrate 460800] [--firmware <path>] <workspace>
 *
 * Progress goes to HIO_CALLBACK_URL when it's set (the driver), to the terminal
 * otherwise. A failure is reported (build_failed / flash_failed) and exits 1.
 */

import * as path from "path";
import type { BuildContext, FlashContext } from "@henglosio/runner";
import { createSend, loadBoardFirmware, loadRunner, resolveFromMap } from "./core/runner.js";

declare const __HIO_VERSION__: string;

type Args = { action: string; workspace: string; options: Record<string, string> };

// `<action> [--name value]... <workspace>` — every option takes a value.
function parseArgs(argv: string[]): Args {
	const [action = "", ...rest] = argv;
	const options: Record<string, string> = {};
	const positional: string[] = [];
	for (let i = 0; i < rest.length; i++) {
		const arg = rest[i]!;
		if (arg.startsWith("--")) {
			const value = rest[i + 1];
			if (value === undefined) throw new Error(`${arg} needs a value.`);
			options[arg.slice(2)] = value;
			i++;
		} else {
			positional.push(arg);
		}
	}
	return { action, workspace: path.resolve(positional[0] ?? "."), options };
}

async function main(): Promise<void> {
	const send = createSend(process.env["HIO_CALLBACK_URL"]);
	let action = "";

	try {
		const args = parseArgs(process.argv.slice(2));
		action = args.action;
		if (action !== "build" && action !== "flash") throw new Error(`Unknown action "${action}" — use build or flash.`);
		const map = args.options["map"];
		if (!map) throw new Error("--map is required.");

		await send({ type: "data", data: `[runner] Henglos IO runner host ${__HIO_VERSION__}, Node ${process.version}\n` });
		const { board, platform, components, settings, options } = await resolveFromMap(path.resolve(map));
		const runner = await loadRunner(platform);
		const base = {
			workspace: args.workspace,
			board,
			boardFirmware: await loadBoardFirmware(board),
			options,
			log: (data: string) => send({ type: "data", data }),
			phase: (phase: "prepare" | "build" | "flash") => send({ type: "phase", phase }),
		};

		if (action === "build") {
			const context: BuildContext = { ...base, platform, components, settings };
			await runner.build(context);
		} else {
			const port = args.options["port"];
			if (!port) throw new Error("--port is required to flash.");
			const firmware = args.options["firmware"];
			const context: FlashContext = {
				...base,
				port,
				baudrate: Number(args.options["baudrate"] ?? "460800"),
				...(firmware ? { firmware: path.resolve(firmware) } : {}),
				advanced: {},
			};
			await runner.flash(context);
		}
	} catch (err) {
		await send({ type: "error", id: `${action || "runner"}_failed`, data: err instanceof Error ? err.message : String(err) });
		process.exit(1);
	}
}

await main();
