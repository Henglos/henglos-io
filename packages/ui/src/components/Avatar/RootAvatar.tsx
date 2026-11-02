import clsx from "clsx";
import React from "react";

export interface RootAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	size?: "sm" | "md" | "lg";
	shape?: "circle" | "square";
}

const sizeStyles = { sm: "size-6", md: "size-8", lg: "size-10" };
const shapeStyles = { circle: "rounded-full", square: "rounded-sm" };

/** The avatar's circle. */
export const RootAvatar: React.FC<RootAvatarProps> = ({
	children,
	size = "md",
	shape = "circle",
	className,
	...props
}) => (
	<div
		className={clsx(
			"relative flex shrink-0 overflow-hidden border border-line-subtle bg-overlay",
			sizeStyles[size],
			shapeStyles[shape],
			className
		)}
		{...props}
	>
		{children}
	</div>
);
