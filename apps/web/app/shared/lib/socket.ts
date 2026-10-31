import { io, type Socket } from "socket.io-client";
import type { TaskEvent } from "@henglosio/shared";
import { getCookie } from "./cookies";

const APP_NAMESPACE = "/app";

let socket: Socket | null = null;

export function getAppSocket(): Socket {
	if (socket?.connected || socket?.active) return socket;

	const token = getCookie("accessToken");

	socket = io(APP_NAMESPACE, {
		path:                "/io/ws",
		extraHeaders:        { authorization: token! },
		autoConnect:         true,
		reconnection:        true,
		reconnectionDelay:     1_000,
		reconnectionDelayMax: 30_000,
		reconnectionAttempts: Infinity,
	});

	return socket;
}

export function refreshAppSocketAuth() {
	const token = getCookie("accessToken");
	if (!socket) return;
	socket.auth = { token };
	if (!socket.connected) socket.connect();
}

export function destroyDriverSocket() {
	socket?.disconnect();
	socket = null;
}

/**
 * Subscribe to a task's event stream. Emits `task:subscribe` (hosting replays
 * the buffered events, then live ones follow) and re-subscribes on reconnect.
 */
export function subscribeToTask(
	taskId: string,
	onEvent: (event: TaskEvent) => void,
): () => void {
	const sock = getAppSocket();

	const channel = `task:${taskId}`;
	const request = () => sock.emit("task:subscribe", { taskId });

	sock.on(channel, onEvent);
	sock.on("connect", request);
	request();

	return () => {
		sock.off(channel, onEvent);
		sock.off("connect", request);
	};
}

