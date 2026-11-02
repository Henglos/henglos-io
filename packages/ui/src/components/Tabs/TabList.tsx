import { cn } from "../../utils/cn";
import React from "react";

export interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
}

/** The row of tabs. */
export const TabList: React.FC<TabListProps> = ({ children, className, ...props }) => (
	<div
		role="tablist"
		className={cn("flex items-center gap-6 border-b border-line", className)}
		{...props}
	>
		{children}
	</div>
);
