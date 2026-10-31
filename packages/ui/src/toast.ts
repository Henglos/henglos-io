/** A toast's kind — its color and icon. */
export type ToastType = "error" | "success" | "warning";

/** One toast, as ToastProvider shows it. */
export interface ToastEvent {
	id: string;
	type: ToastType;
	/** Primary line — short, plain-language. */
	message: string;
	/** Secondary line — the explanation / what to do about it. */
	detail?: string;
	/** A short machine code shown as a copyable chip (error id, HTTP status…). */
	code?: string;
	/** Auto-dismiss delay in ms. `0` keeps the toast until dismissed manually.
	 *  Omitted → the provider picks a sensible default per type. */
	duration?: number;
}

/** A toast's extras: a second line, a code, how long it stays. */
export interface ToastOptions {
	detail?: string;
	code?: string;
	duration?: number;
}

/** The window event emitToast dispatches and ToastProvider listens for. */
export const TOAST_EVENT = "henglosio:toast";

/**
 * emitToast("success", "Workflow saved")
 * emitToast("error", "No connection to the server", {
 *   detail: "The backend may be restarting — try again.",
 *   code: "network_error",
 * })
 */
export function emitToast(type: ToastType, message: string, options: ToastOptions = {}): void {
	window.dispatchEvent(
		new CustomEvent<ToastEvent>(TOAST_EVENT, {
			detail: {
				id: crypto.randomUUID(),
				type,
				message,
				detail: options.detail,
				code: options.code,
				duration: options.duration,
			},
		}),
	);
}
