import React from "react";
import { cn } from "../../utils/cn";

interface LabelProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
}

/** The input's label. */
export const Label: React.FC<LabelProps> = ({ children, className, ...props }) => (
	<div
		className={cn(
			"flex items-center justify-center text-fg-muted px-2 text-sm",
			className
		)}
		{...props}
	>
		{children}
	</div>
);
