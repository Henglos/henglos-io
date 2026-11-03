import { Button, Text } from "@henglosio/ui";
import { Eraser, Plug, PlugZap, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { startRepl, stopTask } from "@shared/api";
import { getAppSocket, subscribeToTask } from "@shared/lib/socket";
import { WorkflowAtom } from "../../store/workflow.store";
import { DeviceSelectionAtom, DriverConnectionAtom } from "../../store/driver.store";

type Status = "idle" | "connecting" | "open" | "closed";

const encoder = new TextEncoder();

// The theme's colors, as xterm needs them (values, not CSS variables).
const themeColors = () => {
	const style = getComputedStyle(document.documentElement);
	const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
	return {
		background: token("--chrome", "#0b0b0c"),
		foreground: token("--fg", "#e6e6e6"),
		cursor: token("--accent", "#7c9cff"),
		selectionBackground: token("--accent-subtle", "#33415a"),
	};
};

/**
 * A terminal on the selected board's own REPL — MicroPython's prompt, as a
 * serial monitor shows it: type Python, Ctrl-C stops what runs, Ctrl-D soft
 * resets. While it's open it holds the board (its program stopped; Play and
 * the rest wait), and closing it lets the program play again. `visible`: the
 * panel stays mounted while another tab shows, so the session and its
 * scrollback survive switching.
 */
export const ReplPanel: React.FC<{ visible: boolean }> = ({ visible }) => {

	const driver = useAtomValue(DriverConnectionAtom);
	const device = useAtomValue(DeviceSelectionAtom);
	const workflow = useAtomValue(WorkflowAtom);

	const [status, setStatus] = useState<Status>("idle");
	const [taskId, setTaskId] = useState<string | null>(null);

	const hostRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);
	const taskRef = useRef<string | null>(null);

	// The terminal itself — once; xterm loaded here, never on the server.
	useEffect(() => {
		let disposed = false;
		let observer: ResizeObserver | null = null;
		void (async () => {
			const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
			if (disposed || !hostRef.current) return;
			const term = new Terminal({
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
				fontSize: 12,
				cursorBlink: true,
				convertEol: false,
				scrollback: 5000,
				theme: themeColors(),
			});
			const fit = new FitAddon();
			term.loadAddon(fit);
			term.open(hostRef.current);
			fit.fit();
			// What's typed (keys, Ctrl-C, a paste) goes to the board as it is.
			term.onData(data => {
				const id = taskRef.current;
				if (id) getAppSocket().emit("repl:input", { taskId: id, data: encoder.encode(data) });
			});
			observer = new ResizeObserver(() => { try { fit.fit(); } catch { /* hidden */ } });
			observer.observe(hostRef.current);
			termRef.current = term;
			fitRef.current = fit;
			term.writeln("\x1b[2mConnect to open the board's REPL.\x1b[0m");
		})();
		return () => {
			disposed = true;
			observer?.disconnect();
			termRef.current?.dispose();
			termRef.current = null;
		};
	}, []);

	// Shown again: fit to the size it has now, and take the keys.
	useEffect(() => {
		if (!visible) return;
		requestAnimationFrame(() => {
			try { fitRef.current?.fit(); } catch { /* not laid out yet */ }
			termRef.current?.focus();
		});
	}, [visible]);

	// The session: the board's bytes in, and its end (stopped, the board gone, busy).
	useEffect(() => {
		if (!taskId) return;
		const socket = getAppSocket();
		const channel = `repl:${taskId}`;
		const onOutput = (data: ArrayBuffer | Uint8Array) => termRef.current?.write(new Uint8Array(data));
		socket.on(channel, onOutput);
		const unsubscribe = subscribeToTask(taskId, event => {
			if (event.kind === "status" && event.status === "running") {
				setStatus("open");
				termRef.current?.focus();
			}
			if (event.kind !== "result") return;
			setStatus("closed");
			taskRef.current = null;
			termRef.current?.writeln(event.ok
				? "\r\n\x1b[2m— REPL closed: the board's program plays again.\x1b[0m"
				: `\r\n\x1b[31m— ${event.error ?? "the REPL closed"}\x1b[0m`);
		});
		return () => {
			socket.off(channel, onOutput);
			unsubscribe();
		};
	}, [taskId]);

	const connect = useCallback(async () => {
		if (!driver || !device || !workflow) return;
		setStatus("connecting");
		termRef.current?.writeln(`\x1b[2m— opening the REPL on ${device.port}…\x1b[0m`);
		try {
			const id = await startRepl(driver.id, workflow.id, device.port);
			taskRef.current = id;
			setTaskId(id);
		} catch {
			setStatus("closed");
			termRef.current?.writeln("\x1b[31m— couldn't open it — is the driver online?\x1b[0m");
		}
	}, [driver, device, workflow]);

	const disconnect = useCallback(async () => {
		if (!driver || !taskId) return;
		await stopTask(driver.id, "repl", taskId).catch(() => {});
	}, [driver, taskId]);

	const send = (bytes: number[]) => {
		if (taskRef.current) getAppSocket().emit("repl:input", { taskId: taskRef.current, data: new Uint8Array(bytes) });
		termRef.current?.focus();
	};

	const live = status === "open" || status === "connecting";
	const unavailable = !driver ? "Connect a driver" : !device ? "Pick a board" : !workflow ? "Open a workflow" : null;

	return (
		<div className="w-full h-full min-w-0 flex flex-col overflow-hidden">

			<div className="flex items-center justify-between px-4 py-2 shrink-0">
				<div className="flex items-center gap-2">
					<Text variant="dim" size="md">REPL</Text>
					<Text variant="low" size="md">
						{status === "open" ? device?.port : status === "connecting" ? "opening…" : unavailable ?? "not connected"}
					</Text>
				</div>
				<div className="flex items-center gap-0.5">
					{live && (
						<>
							<Button.Root variant="ghost" onClick={() => send([0x03])} title="Ctrl-C — stop what's running">
								<Button.Icon><Square size={12} /></Button.Icon>
								<Button.Label>Ctrl-C</Button.Label>
							</Button.Root>
							<Button.Root variant="ghost" onClick={() => send([0x04])} title="Ctrl-D — soft reset (runs main.py, which stops at the next Ctrl-C)">
								<Button.Icon><RotateCcw size={12} /></Button.Icon>
								<Button.Label>Ctrl-D</Button.Label>
							</Button.Root>
						</>
					)}
					<Button.Root variant="ghost" onClick={() => termRef.current?.clear()} title="Clear the screen">
						<Button.Icon><Eraser size={12} /></Button.Icon>
					</Button.Root>
					{live ? (
						<Button.Root variant="ghost" onClick={disconnect} disabled={status === "connecting"} title="Close the REPL — the board's program plays again">
							<Button.Icon><Plug size={12} /></Button.Icon>
							<Button.Label>Disconnect</Button.Label>
						</Button.Root>
					) : (
						<Button.Root variant="ghost" onClick={connect} disabled={!!unavailable} title={unavailable ?? "Open the board's REPL — its program stops while it's open"}>
							<Button.Icon><PlugZap size={12} /></Button.Icon>
							<Button.Label>Connect</Button.Label>
						</Button.Root>
					)}
				</div>
			</div>

			{/* The padding on a wrapper: FitAddon sizes the terminal to its parent's
			    whole width, padding included — on the parent itself the terminal
			    came out wider than its room, the column grew, it fitted again,
			    wider… until the sidebars were pushed off the screen. */}
			<div className="flex-1 min-h-0 min-w-0 px-4 pb-2">
				<div ref={hostRef} className="w-full h-full min-w-0 overflow-hidden" />
			</div>

		</div>
	);

};
