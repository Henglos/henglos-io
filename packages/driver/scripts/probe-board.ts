// Standalone board probe — isolates "the board isn't answering" from anything
// in the task pipeline. Goes through the same ReplSession the use-cases use:
// gets into the raw REPL, reads the .mpy version MicroPython imports, then
// sends one GET_VERSION through the runtime (hio.tools.repl).
//
// Usage (from packages/driver):
//   npx tsx scripts/probe-board.ts COM5
//
// Leaves the board soft-reset, so main.py runs again.

import { SerialPort } from "serialport";
import { buildEmptyPayload, buildFrame, CommandId, FrameType, parseResponse } from "@henglosio/shared";
import { ReplSession } from "../src/daemon/application/services/ReplSession.js";

const port = process.argv[2];

if (!port) {
	console.error("usage: npx tsx scripts/probe-board.ts <port>");
	console.error("\nports seen right now:");
	for (const p of await SerialPort.list()) {
		console.error(`  ${p.path}${p.friendlyName ? `  (${p.friendlyName})` : ""}`);
	}
	process.exit(1);
}

let repl: ReplSession;
try {
	repl = await ReplSession.open(port);
} catch (err) {
	console.log(`❌ no REPL on ${port}: ${err instanceof Error ? err.message : err}`);
	console.log("   Wrong port, board held in reset, or no MicroPython on it → flash the workflow (it installs MicroPython).");
	process.exit(1);
}

try {

	const mpy = await repl.mpyVersion();
	console.log(mpy ? `✅ MicroPython is running — imports mpy v${mpy[0]}` : "⚠️  MicroPython without .mpy support");

	try {
		const { response, frames } = await repl.exchange(
			buildFrame(FrameType.REQUEST, 1, buildEmptyPayload(CommandId.GET_VERSION)),
			line => console.log(`   (device log) ${line}`),
		);
		const answer = response ? parseResponse(response.payload) : null;
		const version = answer?.configs.get(1);
		console.log(version
			? `✅ the runtime answered GET_VERSION: ${new TextDecoder().decode(version)} (${frames.length} frame(s))`
			: "⚠️  the runtime ran but didn't answer GET_VERSION");
	} catch (err) {
		console.log(`⚠️  MicroPython runs, but not the HIO runtime: ${err instanceof Error ? err.message : err}`);
		console.log("   → flash the workflow (it uploads the runtime).");
	}

} finally {
	await repl.close(true);
}
