import clsx from "clsx";
import React from "react";

export interface RootTableProps extends React.HTMLAttributes<HTMLDivElement> {}

/** The table. */
export const RootTable: React.FC<RootTableProps> = ({ children, className, ...props }) => (
	<div
		className={clsx(
			"bg-panel border border-line rounded-lg flex flex-col overflow-hidden",
			className
		)}
		{...props}
	>
		{children}
	</div>
);
