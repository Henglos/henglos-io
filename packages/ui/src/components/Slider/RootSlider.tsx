import clsx from "clsx";
import React, { useCallback, useRef, useState } from "react";

interface RootSliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
	min?: number;
	max?: number;
	step?: number;
	value?: number;
	defaultValue?: number;
	onValueChange?: (value: number) => void;
	disabled?: boolean;
	label?: string;
}

/** A slider for one value. */
export const RootSlider: React.FC<RootSliderProps> = ({
	min = 0,
	max = 100,
	step = 1,
	value: controlled,
	defaultValue = 0,
	onValueChange,
	disabled,
	label,
	className,
	...props
}) => {
	const [internal, setInternal] = useState(defaultValue);
	const isControlled = controlled !== undefined;
	const value = isControlled ? controlled : internal;
	const trackRef = useRef<HTMLDivElement>(null);

	const pct = ((value - min) / (max - min)) * 100;

	const getValueFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
		if (!trackRef.current) return value;
		const rect = trackRef.current.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		const raw = min + ratio * (max - min);
		return Math.round(raw / step) * step;
	}, [min, max, step, value]);

	const handleMouseDown = (e: React.MouseEvent) => {
		if (disabled) return;
		const next = getValueFromEvent(e);
		if (!isControlled) setInternal(next);
		onValueChange?.(next);

		const onMove = (ev: MouseEvent) => {
			const v = getValueFromEvent(ev);
			if (!isControlled) setInternal(v);
			onValueChange?.(v);
		};
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	};

	return (
		<div className={clsx("flex flex-col gap-2", className)} {...props}>
			{label && (
				<div className="flex justify-between items-center">
					<span className="text-sm text-fg-muted">{label}</span>
					<span className="text-sm text-fg">{value}{max === 100 ? "%" : ""}</span>
				</div>
			)}
			<div
				ref={trackRef}
				onMouseDown={handleMouseDown}
				className={clsx(
					"relative rounded-full h-2 bg-active select-none",
					disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
				)}
			>
				<div
					className="rounded-full absolute left-0 top-0 h-2 bg-accent"
					style={{ width: `${pct}%` }}
				/>
				<div
					className="size-4 rounded-full absolute -top-2 bg-fg shadow-sm"
					style={{ left: `calc(${pct}% - 6px)` }}
				/>
			</div>
		</div>
	);
};
