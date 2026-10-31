import { useEffect, useRef, useState } from "react";
import { X, CircleAlert, CircleCheck, TriangleAlert, Copy, Check } from "lucide-react";
import { TOAST_EVENT } from "../toast";
import type { ToastEvent, ToastType } from "../toast";

const EXIT_ANIMATION_MS = 300;

// Errors need more reading time than a "saved!" confirmation.
const DEFAULT_DURATION: Record<ToastType, number> = {
	error: 9000,
	warning: 7000,
	success: 4000,
};

const ACCENT_COLOR: Record<ToastType, string> = {
	error: "var(--danger)",
	success: "var(--success)",
	warning: "var(--warning)",
};

const ICON: Record<ToastType, React.ReactNode> = {
	error: <CircleAlert size={15} />,
	success: <CircleCheck size={15} />,
	warning: <TriangleAlert size={15} />,
};

interface ToastState extends ToastEvent {
	exiting: boolean;
}

const CodeChip = ({ code }: { code: string }) => {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			/* clipboard blocked — nothing to do */
		}
	};

	return (
		<button
			onClick={copy}
			title="Copiar código"
			className="mt-2 inline-flex items-center gap-2 rounded px-2 py-0.5 font-mono text-xs leading-none cursor-pointer transition-colors"
			style={{
				background: "var(--hover)",
				color: "var(--fg-muted)",
			}}
		>
			<span>{code}</span>
			{copied ? <Check size={11} /> : <Copy size={11} />}
		</button>
	);
};

const Toast = ({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) => {
	const accent = ACCENT_COLOR[toast.type];
	const rich = Boolean(toast.detail || toast.code);

	return (
		<div
			style={{
				animation: toast.exiting
					? `toast-out ${EXIT_ANIMATION_MS}ms ease forwards`
					: "toast-in 0.3s ease forwards",
			}}
		>
			<div
				className={`flex items-start gap-4 px-4 py-4 rounded-lg ${rich ? "w-96" : "w-80"}`}
				style={{
					background: "var(--raised)",
					borderWidth: "1px 1px 1px 3px",
					borderStyle: "solid",
					borderColor: `var(--line) var(--line) var(--line) ${accent}`,
					boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
				}}
			>
				<span style={{ color: accent, marginTop: "1px", flexShrink: 0 }}>{ICON[toast.type]}</span>

				<div className="flex-1 min-w-0">
					<p
						className="text-sm leading-5"
						style={{ color: "var(--fg)", fontWeight: rich ? 500 : 400 }}
					>
						{toast.message}
					</p>

					{toast.detail && (
						<p className="text-xs leading-[1.15rem] mt-2" style={{ color: "var(--fg-muted)" }}>
							{toast.detail}
						</p>
					)}

					{toast.code && <CodeChip code={toast.code} />}
				</div>

				<button
					onClick={onDismiss}
					className="shrink-0 hover:opacity-60 transition-opacity cursor-pointer"
					style={{ marginTop: "1px" }}
				>
					<X size={13} color="var(--fg-muted)" />
				</button>
			</div>
		</div>
	);
};

/**
 * Shows the toasts emitToast sends — once, at the app's root. Each closes on its own (errors
 * stay longer) or by hand; an error's code can be copied.
 */
export const ToastProvider = () => {
	const [toasts, setToasts] = useState<ToastState[]>([]);
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	const beginExit = (id: string) => {
		setToasts(prev => prev.map(t => (t.id === id ? { ...t, exiting: true } : t)));
		setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), EXIT_ANIMATION_MS);
	};

	useEffect(() => {
		const onToast = (e: Event) => {
			const detail = (e as CustomEvent<ToastEvent>).detail;

			setToasts(prev => {
				// Collapse a burst of identical toasts (e.g. a retrying request).
				const duplicate = prev.find(
					t => !t.exiting && t.type === detail.type && t.message === detail.message && t.code === detail.code,
				);
				if (duplicate) return prev;
				return [...prev, { ...detail, exiting: false }];
			});

			const duration = detail.duration ?? DEFAULT_DURATION[detail.type];
			if (duration > 0) {
				timers.current.set(detail.id, setTimeout(() => beginExit(detail.id), duration));
			}
		};

		window.addEventListener(TOAST_EVENT, onToast);
		return () => window.removeEventListener(TOAST_EVENT, onToast);
	}, []);

	useEffect(() => {
		const map = timers.current;
		return () => map.forEach(clearTimeout);
	}, []);

	const dismiss = (id: string) => {
		const timer = timers.current.get(id);
		if (timer) {
			clearTimeout(timer);
			timers.current.delete(id);
		}
		beginExit(id);
	};

	if (toasts.length === 0) return null;

	return (
		<div
			className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
			aria-live="polite"
			aria-atomic="false"
		>
			{toasts.map(toast => (
				<div key={toast.id} className="pointer-events-auto">
					<Toast toast={toast} onDismiss={() => dismiss(toast.id)} />
				</div>
			))}
		</div>
	);
};
