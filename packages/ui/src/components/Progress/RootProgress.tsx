import clsx from "clsx";
import React from "react";

interface ProgressProps {
	value: number;
	max?: number;
	label?: string;
	showValue?: boolean;
	size?: "sm" | "md";
	className?: string;
}

/** A bar filled to how far something is. */
export const RootProgress: React.FC<ProgressProps> = ({
	value,
	max = 100,
	label,
	showValue = false,
	size = "sm",
	className,
}) => {
	const pct = Math.min(100, Math.max(0, (value / max) * 100));
	const trackH = size === "sm" ? "h-2" : "h-2";

	return (
		<div className={clsx("flex flex-col gap-2 w-full", className)}>
			{(label || showValue) && (
				<div className="flex items-center justify-between gap-4">
					{label && (
						<span className="text-fg-secondary text-xs truncate">
							{label}
						</span>
					)}
					{showValue && (
						<span className="text-fg-muted text-xs shrink-0">
							{Math.round(pct)}%
						</span>
					)}
				</div>
			)}
			<div
				role="progressbar"
				aria-valuenow={value}
				aria-valuemin={0}
				aria-valuemax={max}
				className={clsx("w-full rounded-full bg-active overflow-hidden", trackH)}
			>
				<div
					className="h-full rounded-full bg-accent transition-all duration-300"
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
};
