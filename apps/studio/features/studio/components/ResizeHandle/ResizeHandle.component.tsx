import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";

type Edge = "top" | "right" | "bottom" | "left";

type UseResizableOptions = {
	/** Where it's kept between visits (this browser only) — not kept when absent. */
	storageKey?: string;
	initial: number;
	min: number;
	max: number;
};

const read = (key: string | undefined): number | undefined => {
	if (!key) return undefined;
	try {
		const stored = Number(localStorage.getItem(key));
		return Number.isFinite(stored) && stored > 0 ? stored : undefined;
	} catch {
		return undefined;
	}
};

const write = (key: string | undefined, size: number) => {
	if (!key) return;
	try {
		localStorage.setItem(key, String(Math.round(size)));
	} catch {
		// Storage off (a private window, blocked site data): the size just isn't kept.
	}
};

/**
 * A size (a width, a height) dragged by a ResizeHandle, between `min` and
 * `max` — and kept in this browser under `storageKey` once a drag ends.
 */
export function useResizable({ storageKey, initial, min, max }: UseResizableOptions) {

	const clamp = useCallback((size: number) => Math.min(max, Math.max(min, size)), [min, max]);
	const [size, setSizeState] = useState(() => clamp(read(storageKey) ?? initial));

	const setSize = useCallback((next: number, keep = false) => {
		const clamped = clamp(next);
		setSizeState(clamped);
		if (keep) write(storageKey, clamped);
	}, [clamp, storageKey]);

	return { size, setSize };

}

type ResizeHandleProps = {
	/**
	 * The edge of the box it sits on — and so which way dragging grows it: a
	 * box's right edge grows it dragged right, its top edge dragged up.
	 */
	edge: Edge;
	/** The box's size now (its width for left / right, its height for top / bottom). */
	size: number;
	/** The new size while dragging; `done` once it's let go. */
	onResize: (size: number, done: boolean) => void;
	className?: string;
};

/**
 * What resizes a panel: a strip on one of its edges, taking no room — the
 * box's own border shows through, a line lights up on hover and while
 * dragging. Its parent needs `position: relative`.
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({ edge, size, onResize, className }) => {

	const [dragging, setDragging] = useState(false);
	const startRef = useRef<{ pointer: number; size: number } | null>(null);
	const horizontal = edge === "left" || edge === "right";
	// Dragging toward the edge's side grows the box.
	const sign = edge === "right" || edge === "bottom" ? 1 : -1;

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		startRef.current = { pointer: horizontal ? e.clientX : e.clientY, size };
		setDragging(true);
	};

	const delta = (e: React.PointerEvent) => startRef.current
		? startRef.current.size + sign * ((horizontal ? e.clientX : e.clientY) - startRef.current.pointer)
		: size;

	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (startRef.current) onResize(delta(e), false);
	};

	const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!startRef.current) return;
		onResize(delta(e), true);
		startRef.current = null;
		setDragging(false);
	};

	// While dragging, the whole page shows the resize cursor and selects nothing.
	useEffect(() => {
		if (!dragging) return;
		const { cursor, userSelect } = document.body.style;
		document.body.style.cursor = horizontal ? "ew-resize" : "ns-resize";
		document.body.style.userSelect = "none";
		return () => {
			document.body.style.cursor = cursor;
			document.body.style.userSelect = userSelect;
		};
	}, [dragging, horizontal]);

	return (
		<div
			role="separator"
			aria-orientation={horizontal ? "vertical" : "horizontal"}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
			className={clsx(
				"group absolute z-20 touch-none",
				horizontal ? "top-0 bottom-0 w-2 cursor-ew-resize" : "left-0 right-0 h-2 cursor-ns-resize",
				edge === "right" && "right-0 translate-x-1/2",
				edge === "left" && "left-0 -translate-x-1/2",
				edge === "top" && "top-0 -translate-y-1/2",
				edge === "bottom" && "bottom-0 translate-y-1/2",
				className,
			)}
		>
			<span
				className={clsx(
					"absolute transition-colors duration-100",
					horizontal ? "top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2" : "left-0 right-0 top-1/2 h-0.5 -translate-y-1/2",
					dragging ? "bg-accent" : "bg-transparent group-hover:bg-accent/60",
				)}
			/>
		</div>
	);

};
