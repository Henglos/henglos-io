import React from "react";
import { cn } from "../../utils/cn";

export interface LabelProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
}

/** The textarea's label. */
export const Label: React.FC<LabelProps> = ({ children, className, ...props }) => (
	<div
		className={cn(
			"flex items-center justify-center text-fg-muted p-2",
			className
		)}
		{...props}
	>
		{children}
	</div>
);
