import clsx from "clsx";
import React from "react";

const variantStyles = {
	default: "bg-raised border border-line-subtle text-fg-secondary",
	brand:   "bg-accent-subtle border border-accent-line text-accent-fg",
	success: "bg-success-subtle border border-success-line text-success",
	warning: "bg-warning-subtle border border-warning-line text-warning",
	error:   "bg-danger-subtle border border-danger-line text-danger",
	info:    "bg-info-subtle border border-info-line text-info",
};

/** A badge's color. */
export type BadgeVariant = keyof typeof variantStyles;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
	variant?: BadgeVariant;
	children: React.ReactNode;
}

/** A small label — a status, a count, a tag. */
export const Badge: React.FC<BadgeProps> = ({
	variant = "default",
	children,
	className,
	...props
}) => (
	<span
		className={clsx(
			"inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-xs  font-medium whitespace-nowrap",
			variantStyles[variant],
			className
		)}
		{...props}
	>
		{children}
	</span>
);
