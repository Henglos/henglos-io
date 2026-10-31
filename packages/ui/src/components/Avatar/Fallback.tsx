import clsx from "clsx";
import React from "react";

interface FallbackProps extends React.HTMLAttributes<HTMLSpanElement> {
	children: React.ReactNode;
}

/** What an avatar shows without a picture — initials, an icon. */
export const Fallback: React.FC<FallbackProps> = ({ children, className, ...props }) => (
	<span
		className={clsx(
			"flex size-full items-center justify-center text-fg-secondary text-xs font-medium select-none",
			className
		)}
		{...props}
	>
		{children}
	</span>
);
