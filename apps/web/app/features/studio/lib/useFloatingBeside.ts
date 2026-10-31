import { useCallback, useEffect, useRef, useState } from "react";

const GAP = 8;

/** Where a floating window goes: next to `panel` (the sidebar), level with `row` (what was clicked). */
export type FloatingAnchor = { panel: DOMRect; row: DOMRect };

export const anchorOf = (element: HTMLElement): FloatingAnchor => ({
	panel: (element.closest("section") ?? element).getBoundingClientRect(),
	row: element.getBoundingClientRect(),
});

/**
 * Positions a `width`-wide floating window beside the sidebar, on whichever
 * side has room, level with what opened it — always inside the viewport.
 *
 * Its height is measured once the content is in the DOM (`measureRef` on the
 * window's content) and again whenever it changes: these windows render in a
 * portal that mounts after the first render, so an effect would read nothing.
 * `style` keeps the window hidden until it's measured, so it never flashes at
 * a spot it then jumps from.
 */
export function useFloatingBeside<T extends HTMLElement>(anchor: FloatingAnchor, width: number) {

	const [height, setHeight] = useState<number | null>(null);
	const observerRef = useRef<ResizeObserver | null>(null);

	const measureRef = useCallback((node: T | null) => {
		observerRef.current?.disconnect();
		observerRef.current = null;
		if (!node) return;
		setHeight(node.offsetHeight);
		observerRef.current = new ResizeObserver(() => setHeight(node.offsetHeight));
		observerRef.current.observe(node);
	}, []);

	useEffect(() => () => observerRef.current?.disconnect(), []);

	const clamp = (value: number, max: number) => Math.max(GAP, Math.min(value, max));
	const left = clamp(
		anchor.panel.right + GAP + width <= window.innerWidth ? anchor.panel.right + GAP : anchor.panel.left - GAP - width,
		window.innerWidth - width - GAP,
	);
	const top = clamp(anchor.row.top, window.innerHeight - (height ?? 0) - GAP);

	return {
		measureRef,
		style: { top, left, width, visibility: height === null ? "hidden" : undefined } as React.CSSProperties,
	};

}
