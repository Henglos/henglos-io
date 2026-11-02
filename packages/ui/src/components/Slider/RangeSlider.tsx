import clsx from "clsx";
import React, { useCallback, useEffect, useRef, useState } from "react";

export interface RangeSliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
	min?: number;
	max?: number;
	step?: number;
	value?: [number, number];
	defaultValue?: [number, number];
	onValueChange?: (value: [number, number]) => void;
	disabled?: boolean;
	labels?: [string, string];
}

/** A slider with two thumbs — a range from one value to another. */
export const RangeSlider: React.FC<RangeSliderProps> = ({
	min = 0,
	max = 100,
	step = 1,
	value: controlled,
	defaultValue = [0, 100],
	onValueChange,
	disabled,
	labels,
	className,
	...props
}) => {
	const [internal, setInternal] = useState<[number, number]>(defaultValue);
	const isControlled = controlled !== undefined;
	const [lo, hi] = isControlled ? controlled : internal;
	const trackRef = useRef<HTMLDivElement>(null);

	const range = max - min;
	const loPct = ((lo - min) / range) * 100;
	const hiPct = ((hi - min) / range) * 100;

	const commit = useCallback((next: [number, number]) => {
		if (!isControlled) setInternal(next);
		onValueChange?.(next);
	}, [isControlled, onValueChange]);

	const getValueFromEvent = useCallback((e: MouseEvent) => {
		if (!trackRef.current) return min;
		const rect = trackRef.current.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		const raw = min + ratio * range;
		return Math.round(raw / step) * step;
	}, [min, range, step]);

	const startDrag = (handle: "lo" | "hi") => (e: React.MouseEvent) => {
		if (disabled) return;
		e.preventDefault();

		const onMove = (ev: MouseEvent) => {
			const v = getValueFromEvent(ev);
			commit(handle === "lo"
				? [Math.min(v, hi - step), hi]
				: [lo, Math.max(v, lo + step)]);
		};
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	};

	return (
		<div className={clsx("flex flex-col gap-4", className)} {...props}>
			{labels && (
				<div className="flex items-center gap-2">
					<InputPill
						label={labels[0]}
						value={lo}
						min={min}
						max={hi - step}
						step={step}
						disabled={disabled}
						onChange={(v) => commit([v, hi])}
					/>
					<InputPill
						label={labels[1]}
						value={hi}
						min={lo + step}
						max={max}
						step={step}
						disabled={disabled}
						onChange={(v) => commit([lo, v])}
					/>
				</div>
			)}
			<div
				ref={trackRef}
				className={clsx(
					"relative rounded-full h-2 bg-active select-none",
					disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
				)}
			>
				<div
					className="rounded-full absolute top-0 h-2 bg-accent"
					style={{ left: `${loPct}%`, width: `${hiPct - loPct}%` }}
				/>
				<div
					onMouseDown={startDrag("lo")}
					className="size-4 rounded-full absolute -top-2 bg-fg shadow-sm cursor-grab active:cursor-grabbing"
					style={{ left: `calc(${loPct}% - 6px)` }}
				/>
				<div
					onMouseDown={startDrag("hi")}
					className="size-4 rounded-full absolute -top-2 bg-fg shadow-sm cursor-grab active:cursor-grabbing"
					style={{ left: `calc(${hiPct}% - 6px)` }}
				/>
			</div>
		</div>
	);
};

export interface InputPillProps {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	disabled?: boolean;
	onChange: (v: number) => void;
}

const InputPill: React.FC<InputPillProps> = ({ label, value, min, max, step, disabled, onChange }) => {
	const [draft, setDraft] = useState(String(value));

	useEffect(() => {
		setDraft(String(value));
	}, [value]);

	const commit = () => {
		const parsed = parseFloat(draft);
		if (!isNaN(parsed)) {
			onChange(Math.max(min, Math.min(max, Math.round(parsed / step) * step)));
		} else {
			setDraft(String(value));
		}
	};

	return (
		<div className={clsx(
			"h-8 rounded-md border border-line flex items-stretch overflow-hidden focus-within:focus-ring",
			disabled && "opacity-40 pointer-events-none"
		)}>
			<div className="px-2 bg-field border-r border-line flex items-center shrink-0">
				<span className="text-xs text-fg-muted whitespace-nowrap">{label}</span>
			</div>
			<input
				type="number"
				className="w-14 px-2 bg-field text-xs text-fg-muted outline-none focus-visible:shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => e.key === "Enter" && commit()}
			/>
		</div>
	);
};
