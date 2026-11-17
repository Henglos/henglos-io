import clsx from "clsx";
import React from "react";

export interface ProgressProps {
	/** Ignored when `indeterminate`. */
	value?: number;
	/** How far isn't known: a segment slides across the track instead. */
	indeterminate?: boolean;
	max?: number;
	label?: string;
	showValue?: boolean;
	size?: "sm" | "md";
	className?: string;
}

/** A bar filled to how far something is — or, `indeterminate`, that it's under way. */
export const RootProgress: React.FC<ProgressProps> = ({
	value = 0,
	indeterminate = false,
	max = 100,
	label,
	showValue = false,
	size = "sm",
	className,
}) => {
	const pct = Math.min(100, Math.max(0, (value / max) * 100));
	const trackH = size === "sm" ? "h-1" : "h-1.5";

	return (
		<div className={clsx("flex flex-col gap-2 w-full", className)}>
			{(label || showValue) && (
				<div className="flex items-center justify-between gap-4">
					{label && (
						<span className="text-fg-secondary text-xs truncate">
							{label}
						</span>
					)}
					{showValue && !indeterminate && (
						<span className="text-fg-muted text-xs shrink-0">
							{Math.round(pct)}%
						</span>
					)}
				</div>
			)}
			<div
				role="progressbar"
				aria-valuenow={indeterminate ? undefined : value}
				aria-valuemin={0}
				aria-valuemax={max}
				aria-busy={indeterminate || undefined}
				className={clsx("w-full rounded-full bg-active overflow-hidden", trackH)}
			>
				{indeterminate ? (
					<div className="h-full w-2/5 rounded-full bg-accent animate-progress-slide" />
				) : (
					<div
						className="h-full rounded-full bg-accent transition-all duration-300"
						style={{ width: `${pct}%` }}
					/>
				)}
			</div>
		</div>
	);
};
