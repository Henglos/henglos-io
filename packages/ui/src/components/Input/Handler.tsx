import { useEffect, useRef } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { useInputContext } from "./context";
import { cn } from "../../utils/cn";
import { readNumber, stepMultiplier, stepValue, writeValue } from "./stepping";

export interface HandlerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
	/** Defaults to a ↔ icon; pass a unit ("ms", "%") or another icon to label the field. */
	children?: React.ReactNode;
	/** Pixels of mouse travel per step. Lower = faster. */
	sensitivity?: number;
	/** Fired once when a scrub ends (not on Escape) — the place to persist the value. */
	onScrubEnd?: (value: number) => void;
}

// Figma-style scrubbing: drag the handle sideways to change the field's value.
// Shift = 10× step, Alt = 0.1× step, Escape reverts. A click without movement
// just focuses the field. Works with type="text" too, as long as the current
// value parses as a number. Its presence also enables ↑/↓ stepping in Field.

const DRAG_THRESHOLD_PX = 3;

type ScrubState = {
	startValue: number;
	value: number;
	travel: number;
	moved: number;
	scrubbing: boolean;
};

/** A handle to drag sideways to change a number (Figma-style scrubbing) — see the notes above. */
export const Handler: React.FC<HandlerProps> = ({ children, className, sensitivity = 2, onScrubEnd, ...props }) => {

	const { inputRef, setScrubbable } = useInputContext();
	const scrub = useRef<ScrubState | null>(null);

	useEffect(() => {
		setScrubbable(true);
		return () => setScrubbable(false);
	}, [setScrubbable]);

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		props.onPointerDown?.(e);

		const input = inputRef.current;
		if (!input || e.button !== 0 || input.disabled || input.readOnly) return;

		const startValue = readNumber(input);
		if (startValue === undefined) return;

		e.preventDefault();

		const target = e.currentTarget;
		scrub.current = { startValue, value: startValue, travel: 0, moved: 0, scrubbing: false };

		const onMove = (ev: PointerEvent) => {
			const state = scrub.current;
			if (!state) return;

			state.moved += Math.abs(ev.movementX);

			if (!state.scrubbing) {
				if (state.moved < DRAG_THRESHOLD_PX) return;
				state.scrubbing = true;
				input.blur();
				// Pointer lock lets the drag go past the screen edge and hides the cursor, like Figma.
				try {
					const lock = target.requestPointerLock() as unknown as Promise<void> | undefined;
					lock?.catch?.(() => {});
				} catch { /* unsupported — scrubbing still works without it */ }
			}

			// Accumulate in step units so switching modifiers mid-drag doesn't jump.
			state.travel += ev.movementX / sensitivity;
			const whole = Math.trunc(state.travel);
			if (whole === 0) return;
			state.travel -= whole;

			const next = stepValue(input, state.value, whole, stepMultiplier(ev));
			if (next === state.value) return;
			state.value = next;
			writeValue(input, next);
		};

		const finish = (cancelled: boolean) => {
			const state = scrub.current;
			scrub.current = null;

			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("keydown", onKey);
			if (document.pointerLockElement === target) document.exitPointerLock();

			if (!state) return;

			if (!state.scrubbing) {
				input.focus();
				input.select();
				return;
			}

			if (cancelled) {
				writeValue(input, state.startValue);
				return;
			}

			onScrubEnd?.(state.value);
		};

		const onUp = () => finish(false);
		const onKey = (ev: KeyboardEvent) => {
			if (ev.key === "Escape") finish(true);
		};

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("keydown", onKey);
	};

	return (
		<div
			{...props}
			className={cn(
				"shrink-0 w-fit h-full flex justify-center items-center px-2",
				"text-xs text-fg-muted hover:text-fg transition-colors",
				"cursor-ew-resize select-none touch-none",
				className
			)}
			onPointerDown={onPointerDown}
		>
			{children ?? <ChevronsLeftRight size={12} />}
		</div>
	);

}
