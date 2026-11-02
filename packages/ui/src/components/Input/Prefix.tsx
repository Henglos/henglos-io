import React from "react";
import { cn } from "../../utils/cn";

export interface PrefixProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
}

/** Text before the field, inside its box. */
export const Prefix: React.FC<PrefixProps> = ({ children, className, ...props }) => (
	<div
		className={cn(
			"shrink-0 h-full flex items-center p-2 border-r border-line text-xs text-fg-muted whitespace-nowrap",
			className
		)}
		{...props}
	>
		{children}
	</div>
);
