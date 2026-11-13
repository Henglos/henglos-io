import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { FloatWindow } from "../FloatWindow";

type ScreenPosition = { x: number; y: number };

const GAP = 8;

// Below and to the right of the click when it fits; otherwise on the side
// that has room (above, to the left) — always inside the viewport.
function placeNear(at: ScreenPosition, size: { width: number; height: number } | null): React.CSSProperties {
	if (!size) return { left: at.x, top: at.y, visibility: "hidden" };
	const clamp = (value: number, max: number) => Math.max(GAP, Math.min(value, max));
	const left = at.x + GAP + size.width <= window.innerWidth ? at.x + GAP : at.x - GAP - size.width;
	const top = at.y + GAP + size.height <= window.innerHeight ? at.y + GAP : at.y - GAP - size.height;
	return {
		left: clamp(left, window.innerWidth - size.width - GAP),
		top: clamp(top, window.innerHeight - size.height - GAP),
	};
}

type FloatingActionPickerProps = {
	screenPosition: ScreenPosition | null;
	onClose: () => void;
	children: React.ReactNode;
};

/**
 * A floating popover shell placed near the click (screenPosition), used by
 * every "pick a registered action" flow (inserting into a connection, adding
 * a loose one from the Explorer, etc).
 *
 * Dismissing (click outside / Escape) uses Radix's non-modal Dialog.Root
 * (avoids a pointer-events clash with React Flow) plus its own invisible
 * overlay (a plain div, not Dialog.Overlay — Overlay is a no-op when
 * modal={false}, and Dialog.Portal drops a plain div loose among its children
 * because of how it uses React.Children.map + asChild internally — so the
 * overlay is rendered outside the Portal).
 */
export const FloatingActionPicker: React.FC<FloatingActionPickerProps> = ({ screenPosition, onClose, children }) => {

	// Its size, measured once it's in the DOM (the portal mounts after the
	// first render) — until then it stays hidden, so it never jumps.
	const [size, setSize] = useState<{ width: number; height: number } | null>(null);
	const observerRef = useRef<ResizeObserver | null>(null);

	const measureRef = useCallback((node: HTMLDivElement | null) => {
		observerRef.current?.disconnect();
		observerRef.current = null;
		if (!node) { setSize(null); return; }
		const measure = () => setSize({ width: node.offsetWidth, height: node.offsetHeight });
		measure();
		observerRef.current = new ResizeObserver(measure);
		observerRef.current.observe(node);
	}, []);

	useEffect(() => () => observerRef.current?.disconnect(), []);

	return (

		<>

			{screenPosition && (
				<div
					className="fixed inset-0 z-9998 bg-transparent"
					onPointerDown={onClose}
				/>
			)}

			<Dialog.Root open={!!screenPosition} onOpenChange={open => { if (!open) onClose(); }} modal={false}>
				<Dialog.Portal>

					{screenPosition && (
						<Dialog.Content
							ref={measureRef}
							className="fixed z-9999 outline-none"
							style={placeNear(screenPosition, size)}
							onEscapeKeyDown={onClose}
							onPointerDownOutside={onClose}
						>
							<Dialog.Title className="sr-only">Add action</Dialog.Title>

							<FloatWindow.Root className="gap-2">
								{children}
							</FloatWindow.Root>

						</Dialog.Content>
					)}

				</Dialog.Portal>
			</Dialog.Root>

		</>

	);

};
